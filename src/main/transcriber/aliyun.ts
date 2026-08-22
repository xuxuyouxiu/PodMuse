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
 * 阿里云百炼 录音文件识别（Paraformer-v2）适配器
 *
 * 协议（REST，X-DashScope-Async 异步任务）：
 * 1. POST /api/v1/services/audio/asr/transcription 提交任务（file_urls）
 * 2. POST /api/v1/tasks/{task_id} 轮询至 SUCCEEDED / FAILED
 * 3. 取 results[0].transcription_url → GET 拉转写 JSON → 拼接 sentences 为纯文本
 *
 * 本地文件上传：提交接口仅接受公网 URL，走百炼文件上传通道：
 * - POST https://dashscope.aliyuncs.com/api/v1/uploads 获取 sts 上传凭证
 * - PUT {policy.data.form_action}（OSS 预签名地址，带 form_data 字段）上传二进制
 * - 凭证数据里的 add_headers 必须原样作为请求头回传
 */
const SUBMIT_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription'
const UPLOAD_INIT_URL = 'https://dashscope.aliyuncs.com/api/v1/uploads'
const MODEL = 'paraformer-v2'
/** 轮询间隔与总超时：超时判失败（上层自动降级本地），避免无限排队卡死任务 */
const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 30 * 60 * 1_000

interface UploadPolicy {
  policy: {
    data: {
      policy: string
      signature?: string
      upload_dir?: string
      form_action: string
      form_data: Record<string, string>
      add_headers?: Record<string, string>
    }
  }
}

export class AliyunTranscriber implements TranscribeEngine {
  id = 'aliyun' as const

  isConfigured(cfg: PodcastConfig): boolean {
    return !!cfg.aliyun_api_key?.trim()
  }

  async transcribe(
    cfg: PodcastConfig,
    audioPath: string,
    language: TranscribeLanguage,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    const apiKey = cfg.aliyun_api_key?.trim()
    if (!apiKey) throw new Error('阿里云百炼 API Key 未配置')

    if (signal.aborted) throw abortError()
    const fileUrl = await this.uploadFile(audioPath, apiKey, hooks, signal)

    if (signal.aborted) throw abortError()
    hooks.status('云端转写中', '已提交阿里百炼任务，等待结果…')
    hooks.log(`  ☁ 已上传音频，提交 Paraformer 转写任务 (${MODEL})`)
    const taskId = await this.submitTask(fileUrl, language, apiKey)

    hooks.status('云端转写中', '排队/识别中，每 3 秒查询一次进度…')
    const resultUrl = await this.pollTask(taskId, apiKey, hooks, signal)
    const text = await this.fetchTranscript(resultUrl, signal)
    if (!text.trim()) throw new Error('阿里百炼返回了空转写结果')
    return text
  }

  /** 上传本地音频到百炼 OSS 通道，返回可公网访问的 URL */
  private async uploadFile(
    audioPath: string,
    apiKey: string,
    hooks: TranscribeHooks,
    signal: AbortSignal,
  ): Promise<string> {
    hooks.status('准备上传', '正在向阿里百炼申请上传凭证…')
    const fileSize = fs.statSync(audioPath).size

    const initRes = await this.fetchJson<UploadPolicy>(
      UPLOAD_INIT_URL,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal,
      },
      '申请上传凭证',
    )
    const action = initRes.policy?.data?.form_action
    if (!action) throw new Error('阿里百炼上传凭证格式异常')

    const fd = new FormData()
    const formData = initRes.policy.data.form_data || {}
    for (const [k, v] of Object.entries(formData)) fd.append(k, v)
    // OSS 表单要求 file 字段放最后
    fd.append(
      'file',
      new Blob([fs.readFileSync(audioPath)]),
      `${initRes.policy.data.upload_dir || 'podmuse'}/${this.fileName(audioPath)}`,
    )

    hooks.status('上传音频', `正在上传到阿里百炼（${(fileSize / 1024 / 1024).toFixed(1)} MB）…`, 5)
    const headers: Record<string, string> = {}
    const addHeaders = initRes.policy.data.add_headers || {}
    for (const [k, v] of Object.entries(addHeaders)) headers[k.toLowerCase()] = v
    const putRes = await fetch(action, { method: 'PUT', body: fd, headers, signal })
    if (!putRes.ok) {
      throw new Error(`音频上传失败（HTTP ${putRes.status}），请检查网络后重试`)
    }

    const ossKey = formData['key'] as string | undefined
    if (formData['x-oss-object-acl'] === 'default' && ossKey) {
      return `https://dashscope-file.oss-cn-beijing.aliyuncs.com/${ossKey}`
    }
    // 兜底：从 form_action 拆 bucket 域名 + key
    try {
      const u = new URL(action)
      return `https://${u.host}${u.pathname}${ossKey ? '' : ''}`
    } catch {
      throw new Error('阿里百炼上传地址解析失败')
    }
  }

  private fileName(p: string): string {
    const norm = p.replace(/\\/g, '/')
    return norm.slice(norm.lastIndexOf('/') + 1)
  }

  /** 提交异步转写任务，返回 task_id */
  private async submitTask(
    fileUrl: string,
    language: TranscribeLanguage,
    apiKey: string,
  ): Promise<string> {
    const parameters: Record<string, unknown> = {}
    if (language === 'zh') parameters.language_hints = ['zh']
    else if (language === 'en') parameters.language_hints = ['en']
    // auto 不传 hints，让引擎自动检测（中英混合场景官方推荐 ['zh','en']）

    const data = {
      model: MODEL,
      input: { file_urls: [fileUrl] },
      ...(Object.keys(parameters).length ? { parameters } : {}),
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
        },
        body: JSON.stringify(data),
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
    let lastLogPct = -1
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
        throw new Error(`阿里百炼转写失败：${out.message || res.message || '未知原因'}`)
      }
      const elapsedMin = Math.floor((Date.now() - startedAt) / 60000)
      // 进度条按时间缓慢推进（上限 90），给用户「还在动」的反馈
      const pct = Math.min(90, Math.round(((Date.now() - startedAt) / POLL_TIMEOUT_MS) * 100))
      if (pct !== lastLogPct) {
        lastLogPct = pct
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
