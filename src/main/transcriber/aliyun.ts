import * as fs from 'fs'
import type { PodcastConfig } from '@shared/types'
import {
  abortError,
  isAbortError,
  type TranscribeEngine,
  type TranscribeHooks,
  type TranscribeLanguage,
} from './types'

/**
 * 阿里云百炼 录音文件识别适配器
 *
 * 协议（2026-08 用真实 key 端到端验证通过）：
 * 1. GET  /api/v1/uploads?action=getPolicy&model={model}        → OSS PostObject 上传凭证
 * 2. POST {upload_host}（OSS 表单上传，Signature 大写，file 字段最后）
 * 3. POST /api/v1/services/audio/asr/transcription 提交任务：
 *      input.file_urls = ["oss://{objectKey}"]（上传凭证文件的引用格式，不带 bucket 名）
 *      Header 必须带 X-DashScope-OssResourceResolve: enable（服务端据此解析 oss:// 临时 URL，
 *      缺失时任务以 FILE_403_FORBIDDEN / SERVER_ERROR 失败）
 * 4. POST /api/v1/tasks/{task_id} 轮询至 SUCCEEDED / FAILED
 * 5. 取 results[0].transcription_url → GET 拉转写 JSON → 拼接文本
 *
 * 模型选型（同日实测对比）：
 * - qwen-audio-3.0-asr-flash-filetrans（默认）：官方非实时首推，热词/Prompt上下文/说话人分离，
 *   多语种自动识别（不支持 language_hints 参数）；单文件 ≤12 小时 / ≤2GB
 * - paraformer-v2 为上一代（官方建议迁移），fun-asr 为备选
 */
const SUBMIT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'
const UPLOAD_POLICY_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads'
const MODEL = 'qwen-audio-3.0-asr-flash-filetrans'
/** 轮询间隔与总超时：超时判失败（上层自动降级本地），避免无限排队卡死任务 */
const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 30 * 60 * 1_000

interface UploadPolicyData {
  policy: string
  signature?: string
  upload_dir?: string
  upload_host?: string
  oss_access_key_id?: string
  x_oss_object_acl?: string
  x_oss_forbid_overwrite?: string
}

export class AliyunTranscriber implements TranscribeEngine {
  id = 'aliyun' as const

  isConfigured(cfg: PodcastConfig): boolean {
    return !!cfg.aliyun_api_key?.trim()
  }

  async transcribe(
    cfg: PodcastConfig,
    audioPath: string,
    _language: TranscribeLanguage,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    const apiKey = cfg.aliyun_api_key?.trim()
    if (!apiKey) throw new Error('阿里云百炼 API Key 未配置')

    if (signal.aborted) throw abortError()
    // 语言说明：该模型多语种自动识别，不接收 language_hints（仅旧 paraformer 支持），
    // 设置页的「语音识别语言」对阿里引擎不生效（对讯飞/本地仍生效）
    const ossUrl = await this.uploadFile(audioPath, apiKey, hooks, signal)

    if (signal.aborted) throw abortError()
    hooks.status('云端转写中', '已提交阿里百炼任务，等待结果…')
    hooks.log(`  ☁ 已上传音频，提交转写任务 (${MODEL})`)
    const taskId = await this.submitTask(ossUrl, apiKey, signal)

    hooks.status('云端转写中', '排队/识别中，每 3 秒查询一次进度…')
    const resultUrl = await this.pollTask(taskId, apiKey, hooks, signal)
    const text = await this.fetchTranscript(resultUrl, signal)
    if (!text.trim()) throw new Error('阿里百炼返回了空转写结果')
    return text
  }

  /** 上传本地音频到百炼 OSS 通道，返回 oss:// 引用 URL */
  private async uploadFile(
    audioPath: string,
    apiKey: string,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    hooks.status('准备上传', '正在向阿里百炼申请上传凭证…')
    const policyRes = await this.fetchJson<{ data?: UploadPolicyData }>(
      `${UPLOAD_POLICY_URL}?action=getPolicy&model=${MODEL}`,
      { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` }, signal },
      '申请上传凭证',
    )
    const p = policyRes.data
    if (!p?.policy || !p.signature || !p.upload_host || !p.upload_dir || !p.oss_access_key_id) {
      throw new Error('阿里百炼上传凭证格式异常')
    }
    const fileSize = fs.statSync(audioPath).size

    // OSS PostObject 表单：签名字段名大写 Signature；file 字段必须放最后
    const norm = audioPath.replace(/\\/g, '/')
    const fileName = norm.slice(norm.lastIndexOf('/') + 1)
    const objectKey = `${p.upload_dir}/${fileName}`
    const fields: Array<[string, string]> = [
      ['OSSAccessKeyId', p.oss_access_key_id],
      ['Signature', p.signature],
      ['policy', p.policy],
      ['key', objectKey],
      ['x-oss-object-acl', p.x_oss_object_acl || 'private'],
      ['x-oss-forbid-overwrite', p.x_oss_forbid_overwrite || 'true'],
      ['success_action_status', '200'],
      ['x-oss-content-type', contentTypeFor(fileName)],
    ]
    const body = buildMultipart(fields, {
      filename: fileName,
      contentType: contentTypeFor(fileName),
      data: fs.readFileSync(audioPath),
    })

    hooks.status('上传音频', `正在上传到阿里百炼（${(fileSize / 1024 / 1024).toFixed(1)} MB）…`, 5)
    let res: Response
    try {
      res = await fetch(p.upload_host, {
        method: 'POST',
        body: new Uint8Array(body),
        headers: { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
        signal,
      })
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new Error(`音频上传网络请求失败：${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok) {
      throw new Error(`音频上传失败（HTTP ${res.status}），请检查网络后重试`)
    }
    return `oss://${objectKey}`
  }

  /** 提交异步转写任务，返回 task_id。oss:// URL 必须带资源解析头，否则服务端读不到文件 */
  private async submitTask(ossUrl: string, apiKey: string, signal: AbortSignal): Promise<string> {
    const data = {
      model: MODEL,
      input: { file_urls: [ossUrl] },
    }
    const res = await this.fetchJson<{
      output?: { task_id?: string }
      message?: string
      code?: string
    }>(
      SUBMIT_URL,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable',
          'X-DashScope-OssResourceResolve': 'enable',
        },
        body: JSON.stringify(data),
        signal,
      },
      '提交转写任务',
    )
    const taskId = res.output?.task_id
    if (!taskId) {
      throw new Error(`阿里百炼任务创建失败：${res.message || res.code || '未知错误'}`)
    }
    return taskId
  }

  /** 轮询任务状态直到完成，返回 transcription_url */
  private async pollTask(
    taskId: string,
    apiKey: string,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    const startedAt = Date.now()
    let lastPct = -1
    for (;;) {
      if (signal.aborted) throw abortError()
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error('云端转写超时（30 分钟无结果），请改用本地引擎或稍后重试')
      }
      const res = await this.fetchJson<{
        output?: {
          task_status?: string
          results?: Array<{ transcription_url?: string; subtask_status?: string }>
          message?: string
          code?: string
        }
        message?: string
      }>(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
        { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, signal },
        '查询转写进度',
      )
      const out = res.output || {}
      const status = out.task_status
      if (status === 'SUCCEEDED') {
        const url = out.results?.find(r => r.transcription_url)?.transcription_url
        if (!url) throw new Error('阿里百炼任务成功但未返回转写结果链接')
        return url
      }
      if (status === 'FAILED') {
        throw new Error(
          `阿里百炼转写失败：${out.message || out.code || res.message || '未知原因'}`,
        )
      }
      // 进度条按时间缓慢推进（上限 90），给用户「还在动」的反馈
      const pct = Math.min(90, Math.round(((Date.now() - startedAt) / POLL_TIMEOUT_MS) * 100))
      if (pct !== lastPct) {
        lastPct = pct
        const elapsedMin = Math.floor((Date.now() - startedAt) / 60000)
        hooks.status(
          '云端转写中',
          elapsedMin > 0 ? `已等待 ${elapsedMin} 分钟…` : '排队/识别中…',
          pct,
        )
      }
      await sleep(POLL_INTERVAL_MS, signal)
    }
  }

  /** 拉取转写 JSON 并拼接为纯文本 */
  private async fetchTranscript(url: string, signal: AbortSignal): Promise<string> {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`获取转写结果失败（HTTP ${res.status}）`)
    const json = (await res.json()) as {
      transcripts?: Array<{
        text?: string
        sentences?: Array<{ text?: string }>
      }>
    }
    const t = json.transcripts?.[0]
    if (t?.text) return t.text
    if (t?.sentences?.length) {
      return t.sentences.map(s => s.text || '').join('')
    }
    return ''
  }

  private async fetchJson<T>(url: string, init: RequestInit, what: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (e) {
      if (isAbortError(e)) throw e
      throw new Error(`${what}网络请求失败：${e instanceof Error ? e.message : String(e)}`)
    }
    if (!res.ok) {
      let detail = ''
      try {
        const j = (await res.json()) as { message?: string; code?: string }
        detail = j.message || j.code || ''
      } catch {}
      throw new Error(`${what}失败（HTTP ${res.status}）${detail ? '：' + detail : ''}`)
    }
    return (await res.json()) as T
  }
}

const BOUNDARY = '----PodMuseFormBoundary7d3f2a91'

function contentTypeFor(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    flac: 'audio/flac',
    ogg: 'application/ogg',
    opus: 'application/ogg',
    aac: 'audio/aac',
    mp4: 'video/mp4',
  }
  return map[ext] || 'application/octet-stream'
}

/** 构造 multipart/form-data 请求体（表单字段在前、file 字段最后——OSS 要求） */
function buildMultipart(
  fields: Array<[string, string]>,
  file: { filename: string; contentType: string; data: Buffer },
): Buffer {
  const parts: Buffer[] = []
  for (const [name, value] of fields) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        'utf-8',
      ),
    )
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      'utf-8',
    ),
  )
  parts.push(file.data)
  parts.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf-8'))
  return Buffer.concat(parts)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
