import * as fs from 'fs'
import * as crypto from 'crypto'
import type { PodcastConfig } from '@shared/types'
import {
  abortError,
  isAbortError,
  type TranscribeEngine,
  type TranscribeHooks,
  type TranscribeLanguage,
} from './types'

/**
 * 讯飞语音转写（Long Form ASR）适配器
 *
 * 协议（https://www.xfyun.cn/doc/asr/lfasr/API.html）：
 * 1. POST /api/prepare   → task_id（file_len/file_name/slice_num）
 * 2. POST /api/upload    → 逐片上传（10MB/片，slice_id 从 'aaaaaaaaaa' 递增）
 * 3. POST /api/merge     → 通知合并并排队转写
 * 4. POST /api/getProgress 轮询，status=9 表示结果就绪
 * 5. POST /api/getResult → data 为 JSON 字符串，orderResult 里拼纯文本
 *
 * 签名：baseString = appid + ts（秒）；signa = Base64(HmacSHA1(MD5(baseString), apiKey))
 */
const BASE = 'https://raasr.xfyun.cn/api'
const SLICE_SIZE = 10 * 1024 * 1024
const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 30 * 60 * 1_000

/** 讯飞错误码 → 可读中文（节选用户能自救的） */
function describeErrNo(errNo: number, fallback: string): string {
  const map: Record<number, string> = {
    26601: '讯飞鉴权失败：AppID 或 API Key 不正确',
    26625: '讯飞服务时长不足，请到讯飞控制台领取/购买套餐',
    26633: '讯飞服务时长不足，请到讯飞控制台领取/购买套餐',
    26621: '音频超过讯飞 500MB 大小限制',
    26622: '音频超过讯飞 5 小时时长限制',
    26623: '音频格式不受讯飞支持（支持 wav/flac/opus/m4a/mp3）',
    26607: '该语种未在讯飞控制台开通授权',
    26603: '请求过于频繁，请稍后重试',
    26606: '空音频或音频损坏',
  }
  return map[errNo] || fallback
}

export class XfyunTranscriber implements TranscribeEngine {
  id = 'xfyun' as const

  isConfigured(cfg: PodcastConfig): boolean {
    return !!cfg.xfyun_app_id?.trim() && !!cfg.xfyun_api_key?.trim()
  }

  async transcribe(
    cfg: PodcastConfig,
    audioPath: string,
    language: TranscribeLanguage,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    const appId = cfg.xfyun_app_id?.trim()
    const apiKey = cfg.xfyun_api_key?.trim()
    if (!appId || !apiKey) throw new Error('讯飞 AppID / API Key 未配置')

    if (signal.aborted) throw abortError()
    const fileName = audioPath.replace(/\\/g, '/').split('/').pop() || 'audio.mp3'
    const fileBuf = fs.readFileSync(audioPath)
    const sliceNum = Math.max(1, Math.ceil(fileBuf.length / SLICE_SIZE))

    hooks.status(
      '准备上传',
      `正在向讯飞提交转写任务（${(fileBuf.length / 1024 / 1024).toFixed(1)} MB）…`,
    )
    const taskId = await this.prepare(appId, apiKey, fileName, fileBuf.length, sliceNum, language)

    hooks.status('上传音频', '正在分片上传音频…', 5)
    await this.uploadSlices(taskId, fileBuf, appId, apiKey, hooks, signal)

    await this.merge(taskId, appId, apiKey)
    hooks.log(`  ☁ 讯飞任务已提交 (${taskId})，等待转写结果…`)

    hooks.status('云端转写中', '排队/识别中，每 5 秒查询一次进度…')
    const resultJson = await this.pollAndFetch(taskId, appId, apiKey, hooks, signal)
    return this.extractText(resultJson)
  }

  /** signa = Base64(HmacSHA1(md5hex(appid + ts), api_key)) —— 官方 demo 公式 */
  private signa(appId: string, ts: string, apiKey: string): string {
    const md5 = crypto
      .createHash('md5')
      .update(appId + ts)
      .digest('hex')
    return crypto.createHmac('sha1', apiKey).update(md5).digest('base64')
  }

  private async postForm(
    path: string,
    params: Record<string, string>,
  ): Promise<{ ok: number; err_no?: number; failed?: string | null; data?: string | null }> {
    const body = new URLSearchParams(params).toString()
    let res: Response
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body,
      })
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new Error(`讯飞网络请求失败：${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok) throw new Error(`讯飞接口 ${path} 失败（HTTP ${res.status}）`)
    return (await res.json()) as {
      ok: number
      err_no?: number
      failed?: string | null
      data?: string | null
    }
  }

  private async prepare(
    appId: string,
    apiKey: string,
    fileName: string,
    fileLen: number,
    sliceNum: number,
    language: TranscribeLanguage,
  ): Promise<string> {
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await this.postForm('prepare', {
      app_id: appId,
      ts,
      signa: this.signa(appId, ts, apiKey),
      file_len: String(fileLen),
      file_name: fileName,
      slice_num: String(sliceNum),
      // auto 视为中英混合：讯飞 cn 语种本身支持中英混说
      language: language === 'en' ? 'en' : 'cn',
    })
    if (res.ok !== 0) {
      throw new Error(describeErrNo(res.err_no || 0, res.failed || '讯飞预处理失败'))
    }
    if (!res.data) throw new Error('讯飞预处理未返回任务 ID')
    return res.data
  }

  /** 逐片上传，slice_id 按官方规则从 'aaaaaaaaaa' 进位递增 */
  private async uploadSlices(
    taskId: string,
    fileBuf: Buffer,
    appId: string,
    apiKey: string,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<void> {
    const total = Math.ceil(fileBuf.length / SLICE_SIZE)
    let sliceId = 'aaaaaaaaaa'
    for (let i = 0; i < total; i++) {
      if (signal.aborted) throw abortError()
      const chunk = fileBuf.subarray(i * SLICE_SIZE, Math.min((i + 1) * SLICE_SIZE, fileBuf.length))
      const fd = new FormData()
      fd.append('app_id', appId)
      const ts = String(Math.floor(Date.now() / 1000))
      fd.append('ts', ts)
      fd.append('signa', this.signa(appId, ts, apiKey))
      fd.append('task_id', taskId)
      fd.append('slice_id', sliceId)
      fd.append('content', new Blob([new Uint8Array(chunk)]))
      sliceId = nextSliceId(sliceId)

      let res: Response
      try {
        res = await fetch(`${BASE}/upload`, { method: 'POST', body: fd, signal })
      } catch (e) {
        if (isAbortError(e)) throw e
        throw new Error(`讯飞分片上传失败：${e instanceof Error ? e.message : String(e)}`)
      }
      if (!res.ok) throw new Error(`讯飞分片上传失败（HTTP ${res.status}）`)
      const j = (await res.json()) as { ok: number; err_no?: number; failed?: string | null }
      if (j.ok !== 0)
        throw new Error(describeErrNo(j.err_no || 0, j.failed || '讯飞分片上传被拒绝'))

      const pct = Math.round(((i + 1) / total) * 100)
      // 上传进度映射到整体进度条前 30%
      hooks.status('上传音频', `已上传 ${pct}%`, Math.min(28, Math.round(pct * 0.28)))
    }
  }

  private async merge(taskId: string, appId: string, apiKey: string): Promise<void> {
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await this.postForm('merge', {
      app_id: appId,
      ts,
      signa: this.signa(appId, ts, apiKey),
      task_id: taskId,
    })
    if (res.ok !== 0) {
      throw new Error(describeErrNo(res.err_no || 0, res.failed || '讯飞文件合并失败'))
    }
  }

  private async pollAndFetch(
    taskId: string,
    appId: string,
    apiKey: string,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    const startedAt = Date.now()
    for (;;) {
      if (signal.aborted) throw abortError()
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error('讯飞转写超时（30 分钟无结果），请改用本地引擎或稍后重试')
      }
      const ts = String(Math.floor(Date.now() / 1000))
      const res = await this.postForm('getProgress', {
        app_id: appId,
        ts,
        signa: this.signa(appId, ts, apiKey),
        task_id: taskId,
      })
      if (res.ok !== 0) {
        throw new Error(describeErrNo(res.err_no || 0, res.failed || '讯飞进度查询失败'))
      }
      let status = -1
      let statusDesc = ''
      try {
        const parsed = JSON.parse(res.data || '{}') as { status?: number; desc?: string }
        status = parsed.status ?? -1
        statusDesc = parsed.desc || ''
      } catch {}
      if (status === 9) break
      if (status < 0) {
        throw new Error(`讯飞转写失败：${statusDesc || '未知状态'}`)
      }
      const elapsedMin = Math.floor((Date.now() - startedAt) / 60000)
      const pct = Math.min(90, Math.round(((Date.now() - startedAt) / POLL_TIMEOUT_MS) * 100))
      hooks.status(
        '云端转写中',
        elapsedMin > 0 ? `已等待 ${elapsedMin} 分钟…` : `排队/识别中…（${statusDesc}）`,
        pct,
      )
      await sleep(POLL_INTERVAL_MS, signal)
    }
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await this.postForm('getResult', {
      app_id: appId,
      ts,
      signa: this.signa(appId, ts, apiKey),
      task_id: taskId,
    })
    if (res.ok !== 0) {
      throw new Error(describeErrNo(res.err_no || 0, res.failed || '讯飞获取结果失败'))
    }
    return res.data || ''
  }

  /** 结果 JSON 的 orderResult[].data 里是逐句文本，按时间顺序拼接 */
  private extractText(resultData: string): string {
    try {
      const parsed = JSON.parse(resultData) as {
        orderResult?: Array<{ data?: string }>
      }
      const parts: string[] = []
      for (const seg of parsed.orderResult || []) {
        try {
          const inner = JSON.parse(seg.data || '{}') as {
            ws?: Array<{ cw?: Array<{ w?: string }> }>
          }
          if (inner.ws?.length) {
            parts.push(inner.ws.map(w => (w.cw || []).map(c => c.w || '').join('')).join(''))
          } else if (seg.data) {
            // 兜底：直接把 data 当文本片段
            parts.push(seg.data.replace(/\s+/g, ''))
          }
        } catch {
          if (seg.data) parts.push(seg.data)
        }
      }
      const text = parts.join('')
      if (!text.trim()) throw new Error('讯飞返回了空转写结果')
      return text
    } catch (e) {
      if (e instanceof Error && e.message.includes('空转写')) throw e
      throw new Error('讯飞转写结果解析失败')
    }
  }
}

/** slice_id 进位生成器：'aaaaaaaaaa' → 'aaaaaaaaab' … 'aaaaaaaaz' → 'aaaaaaaaaa'+'ba' 风格进位 */
export function nextSliceId(id: string): string {
  const chars = id.split('')
  let i = chars.length - 1
  while (i >= 0) {
    if (chars[i] !== 'z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1)
      return chars.join('')
    }
    chars[i] = 'a'
    i--
  }
  return 'a' + chars.join('')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
    setTimeout(() => signal.removeEventListener('abort', onAbort), ms + 10)
  })
}
