import * as path from 'path'
import * as fs from 'fs'
import { StepInfo, AIProviderId } from '@shared/types'
import { cleanTitleForFilename } from '@shared/utils'
import { runWhisper } from './whisper'
import { correctTranscript, generateNotes, evaluateQuality } from './ai-client'
import {
  parseEntityBlocks,
  writeEntityNotes,
  fillMissingTermCards,
  extractBodyWikiLinks,
  fillMissingEntityCards,
} from './entity-cards'
import { isSubPathOf } from './security'
import {
  platformRegistry,
  fetchOgTitle, // eslint-disable-line @typescript-eslint/no-unused-vars
  extractAudioWithYtDlp,
  extractSubtitles,
  parseSubtitleToText,
  detectYtDlp,
  autoDownloadYtDlp,
} from './platforms'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

const HEADERS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

/** 通用 og:title 提取（兜底用，优先使用适配器的标题提取） */
export { fetchOgTitle as fetchPodcastTitle } from './platforms'

function getTempDir(audioDir: string) {
  const { app } = require('electron')
  const d = audioDir || path.join(app.getPath('userData'), '_podcast_temp')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

/**
 * 从笔记内容中解析 frontmatter 的 category 字段
 * @param content 笔记内容（Markdown）
 * @returns category 值，如果未找到则返回空字符串
 */
function parseCategory(content: string): string {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return ''

  const frontmatter = frontmatterMatch[1]
  const categoryMatch = frontmatter.match(/category:\s*\[?([^\]\n]+)/)
  if (!categoryMatch) return ''

  // 清理 category 值：去掉方括号、引号、多余空格
  let category = categoryMatch[1].trim()
  category = category.replace(/[\[\]"']/g, '').trim()

  // 如果 category 包含多个值（用逗号分隔），只取第一个
  if (category.includes(',')) {
    category = category.split(',')[0].trim()
  }
  if (category.includes('，')) {
    category = category.split('，')[0].trim()
  }

  return category
}

// 音频提取逻辑已迁移到 platformRegistry 的各平台适配器中

export async function processPodcast(
  podcastUrl: string,
  providerConfig: { baseUrl: string; apiKey: string; model: string } | null,
  providerId: string,
  language: string = 'zh',
  obsidianDir: string = '',
  audioDir: string = '',
  sendStep?: (step: StepInfo) => void,
  sendLog?: (msg: string) => void,
  signal?: AbortSignal,
  isLocalFile?: boolean,
  force: boolean = false,
): Promise<string | null> {
  const log = (m: string) => {
    sendLog?.(m)
    console.log(m)
  }
  const step = (s: StepInfo) => {
    if (signal?.aborted && s.status !== 'stopped') return
    sendStep?.(s)
  }
  const check = () => {
    if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' })
  }

  let title: string | null = null
  let audioPath: string
  let preTranscript: string | null = null
  let platformMetadata: Record<string, string> = {}

  if (isLocalFile) {
    log(`开始处理本地文件: ${podcastUrl}`)
    check()
    title = path.basename(podcastUrl, path.extname(podcastUrl))
    audioPath = podcastUrl

    if (!fs.existsSync(audioPath)) {
      step({
        step: 1,
        title: '解析页面',
        subtitle: '文件不存在',
        status: 'error',
        detail: audioPath,
      })
      log(`  ❌ 文件不存在: ${audioPath}`)
      return null
    }
    step({
      step: 1,
      title: '解析页面',
      subtitle: title,
      status: 'done',
      detail: `本地文件: ${path.basename(audioPath)}`,
    })
    log(`  文件名: ${title}`)

    check()
    const stat = fs.statSync(audioPath)
    step({
      step: 2,
      title: '下载音频',
      subtitle: `${(stat.size / 1048576).toFixed(1)} MB`,
      status: 'done',
      progress: 100,
      detail: '本地文件，跳过下载',
    })
    log('  [2/5] 使用本地文件，跳过下载')
  } else {
    log(`开始处理: ${podcastUrl}`)

    check()
    // 通过平台注册表识别平台并路由到对应适配器
    const platformInfo = platformRegistry.findAdapter(podcastUrl)
    if (!platformInfo) {
      step({
        step: 1,
        title: '解析页面',
        subtitle: '不支持的平台',
        status: 'error',
        detail: '暂不支持该平台，请使用本地文件方式',
      })
      log('  ❌ 不支持的平台链接')
      return null
    }
    log(`  🏷 识别平台: ${platformInfo.name}`)

    step({
      step: 1,
      title: '解析页面',
      subtitle: `解析 ${platformInfo.name}...`,
      status: 'running',
      detail: `正在提取 ${platformInfo.name} 内容...`,
    })
    try {
      const result = await platformInfo.adapter.extractAudio(podcastUrl, signal)

      // 捕获平台元数据（UP主、频道名等），后续注入 AI prompt
      if (result.metadata) {
        platformMetadata = result.metadata
        const metaParts: string[] = []
        if (result.metadata.owner) metaParts.push(`UP主: ${result.metadata.owner}`)
        if (result.metadata.channel) metaParts.push(`频道: ${result.metadata.channel}`)
        if (metaParts.length) log(`  📋 元数据: ${metaParts.join(', ')}`)
      }

      if (result.type === 'pre_transcribed' && result.transcript) {
        // 已有转写文本（如 YouTube 字幕），跳过下载和 Whisper
        preTranscript = result.transcript
        title = result.title || null
        step({
          step: 1,
          title: '解析页面',
          subtitle: title || '未知标题',
          status: 'done',
          detail: `${platformInfo.name}：已获取字幕/转写`,
        })
        log(`  标题: ${title || '未知'}（使用平台字幕，${preTranscript.length} 字）`)

        check()
        step({
          step: 2,
          title: '下载音频',
          subtitle: '跳过（使用字幕）',
          status: 'done',
          progress: 100,
          detail: '已获取平台字幕，无需下载音频',
        })
        log('  [2/5] 使用平台字幕，跳过下载')
        audioPath = ''
      } else if (result.type === 'yt_dlp') {
        // yt-dlp 提取音频（B 站、YouTube 等）
        title = result.title || null
        let ytDlp = detectYtDlp()
        if (!ytDlp.available) {
          // 自动下载 yt-dlp
          step({
            step: 1,
            title: '解析页面',
            subtitle: '正在下载 yt-dlp',
            status: 'running',
            detail: '首次使用 YouTube 需要下载 yt-dlp 组件...',
          })
          log('  ⬇ yt-dlp 未安装，正在自动下载...')
          try {
            const downloadedPath = await autoDownloadYtDlp(msg => {
              step({
                step: 1,
                title: '解析页面',
                subtitle: '正在下载 yt-dlp',
                status: 'running',
                detail: msg,
              })
              log(`  [yt-dlp] ${msg}`)
            }, signal)
            ytDlp = detectYtDlp()
            if (!ytDlp.available) {
              step({
                step: 1,
                title: '解析页面',
                subtitle: 'yt-dlp 下载失败',
                status: 'error',
                detail: '下载完成但无法检测到 yt-dlp，请检查网络连接',
              })
              log('  ❌ yt-dlp 下载后仍无法检测到')
              return null
            }
            log(`  ✅ yt-dlp 已安装: ${downloadedPath}`)
          } catch (e: unknown) {
            if (signal?.aborted) throw e
            step({
              step: 1,
              title: '解析页面',
              subtitle: 'yt-dlp 下载失败',
              status: 'error',
              detail: errMsg(e),
            })
            log(`  ❌ yt-dlp 下载失败: ${errMsg(e)}`)
            return null
          }
        }
        if (ytDlp.outdated) {
          log(`  ⚠ yt-dlp 版本过低 (${ytDlp.version})，建议更新`)
        }

        const tmp = getTempDir(audioDir)
        const audioName = cleanTitleForFilename(title || result.videoId || 'episode')
        const outputPath = path.join(tmp, `${audioName}.mp3`)

        // 如果音频已缓存，检查是否需要提取字幕
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
          log('  ⏭ yt-dlp 音频已存在，跳过提取')
          step({
            step: 1,
            title: '解析页面',
            subtitle: title || '未知标题',
            status: 'done',
            detail: `${platformInfo.name}：音频已缓存`,
          })
        } else {
          step({
            step: 1,
            title: '解析页面',
            subtitle: '提取音频',
            status: 'running',
            detail: `使用 yt-dlp 提取 ${platformInfo.name} 音频...`,
          })
          try {
            const extracted = await extractAudioWithYtDlp(
              ytDlp.path!,
              result.audioUrl!,
              tmp,
              audioName,
              msg => log(`  [yt-dlp] ${msg}`),
              signal,
            )
            // yt-dlp 输出可能不是 .mp3 命名，需重命名
            if (extracted !== outputPath && fs.existsSync(extracted)) {
              if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
              fs.renameSync(extracted, outputPath)
            }
          } catch (e: unknown) {
            if (signal?.aborted) throw e
            step({
              step: 1,
              title: '解析页面',
              subtitle: '提取失败',
              status: 'error',
              detail: errMsg(e),
            })
            log(`  ❌ yt-dlp 提取失败: ${errMsg(e)}`)
            return null
          }
          step({
            step: 1,
            title: '解析页面',
            subtitle: title || '未知标题',
            status: 'done',
            detail: `${platformInfo.name}：音频提取完成`,
          })
        }
        log(`  标题: ${title || '未知'}`)

        // YouTube 字幕优先策略：尝试提取平台字幕，命中则跳过 Whisper
        if (platformInfo.id === 'youtube') {
          check()
          log('  🔍 检查 YouTube 字幕...')
          try {
            const subPath = await extractSubtitles(
              ytDlp.path!,
              result.audioUrl!,
              tmp,
              audioName,
              ['zh-Hans', 'zh', 'zh-CN', 'en'],
              msg => log(`  [yt-dlp-sub] ${msg}`),
              signal,
            )
            if (subPath) {
              const subText = parseSubtitleToText(subPath)
              if (subText && subText.length > 50) {
                preTranscript = subText
                log(`  ✅ 使用 YouTube 字幕（${preTranscript.length} 字）`)
                step({
                  step: 2,
                  title: '下载音频',
                  subtitle: '跳过（使用字幕）',
                  status: 'done',
                  progress: 100,
                  detail: `已获取 YouTube 字幕 ${preTranscript.length} 字`,
                })
                // 清理字幕临时文件
                try {
                  fs.unlinkSync(subPath)
                } catch {}
              } else {
                log('  🔄 YouTube 字幕过短或无效，降级到 Whisper')
              }
            } else {
              log('  🔄 未找到 YouTube 字幕，降级到 Whisper')
            }
          } catch (e: unknown) {
            log(`  🔄 YouTube 字幕提取失败（${errMsg(e)}），降级到 Whisper`)
          }
        }

        if (!preTranscript) {
          check()
          audioPath = outputPath
          const stat = fs.statSync(audioPath)
          step({
            step: 2,
            title: '下载音频',
            subtitle: `${(stat.size / 1048576).toFixed(1)} MB`,
            status: 'done',
            progress: 100,
            detail: `yt-dlp 提取完成`,
          })
          log(`  [2/5] yt-dlp 提取完成: ${(stat.size / 1048576).toFixed(1)} MB`)
        } else {
          audioPath = outputPath
        }
      } else {
        // 直接 URL 下载（小宇宙、直接音频链接等）
        const audioUrl = result.audioUrl
        title = result.title || null
        if (!audioUrl) {
          step({
            step: 1,
            title: '解析页面',
            subtitle: '提取音频链接',
            status: 'error',
            detail: '未找到音频链接',
          })
          log('  ❌ 无法提取音频链接')
          return null
        }
        step({
          step: 1,
          title: '解析页面',
          subtitle: title || '未知标题',
          status: 'done',
          detail: '找到音频链接',
        })
        log(`  标题: ${title || '未知'}`)

        check()
        step({
          step: 2,
          title: '下载音频',
          subtitle: '下载中...',
          status: 'running',
          detail: '开始下载',
          progress: 0,
        })
        log('  [2/5] 下载音频...')
        const tmp = getTempDir(audioDir)
        let ext = audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'mp3'
        if (!['mp3', 'm4a', 'm4s', 'ogg', 'aac', 'wav'].includes(ext)) ext = 'mp3'
        const audioName = cleanTitleForFilename(title || 'episode')
        audioPath = path.join(tmp, `${audioName}.${ext}`)

        // 如果 audioUrl 是本地文件路径，直接复制而非下载
        if (fs.existsSync(audioUrl)) {
          log('  ⏭ 音频为本地文件，直接使用')
          const localExt = audioUrl.split('.').pop()?.toLowerCase() || 'mp4'
          audioPath = path.join(tmp, `${audioName}.${localExt}`)
          if (!fs.existsSync(audioPath)) {
            fs.copyFileSync(audioUrl, audioPath)
          }
          step({
            step: 2,
            title: '下载音频',
            subtitle: `${(fs.statSync(audioPath).size / 1048576).toFixed(1)} MB (本地)`,
            status: 'done',
            progress: 100,
          })
        } else if (fs.existsSync(audioPath) && fs.statSync(audioPath).size > 1024) {
          log('  ⏭ 音频已存在，跳过下载')
          step({
            step: 2,
            title: '下载音频',
            subtitle: `${(fs.statSync(audioPath).size / 1048576).toFixed(1)} MB (已缓存)`,
            status: 'done',
            progress: 100,
          })
        } else {
          try {
            const fetchHeaders: Record<string, string> = {
              'User-Agent': HEADERS_UA,
              ...result.headers,
            }
            const audioResp = await fetch(audioUrl, { headers: fetchHeaders, signal })
            if (!audioResp.ok || !audioResp.body) {
              step({
                step: 2,
                title: '下载音频',
                subtitle: `HTTP ${audioResp.status}`,
                status: 'error',
              })
              log(`  ❌ 下载失败 HTTP ${audioResp.status}`)
              return null
            }
            const reader = audioResp.body.getReader()
            const { createWriteStream } = await import('fs')
            const ws = createWriteStream(audioPath)
            let received = 0
            const total = parseInt(audioResp.headers.get('content-length') || '0')
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              ws.write(value)
              received += value.length
              if (total > 0) {
                step({
                  step: 2,
                  title: '下载音频',
                  subtitle: '下载中...',
                  status: 'running',
                  detail: `${(received / 1048576).toFixed(1)} MB`,
                  progress: Math.round((received / total) * 100),
                })
              }
            }
            ws.end()
            if (received === 0) {
              step({ step: 2, title: '下载音频', subtitle: '空文件', status: 'error' })
              log('  ❌ 下载内容为空')
              return null
            }
            step({
              step: 2,
              title: '下载音频',
              subtitle: `${(received / 1048576).toFixed(1)} MB`,
              status: 'done',
              progress: 100,
            })
            log('  ✓ 下载完成')
          } catch (e: unknown) {
            if (signal?.aborted) throw e
            step({
              step: 2,
              title: '下载音频',
              subtitle: '下载失败',
              status: 'error',
              detail: errMsg(e),
            })
            log(`  ❌ 下载失败: ${errMsg(e)}`)
            return null
          }
        }
      }
    } catch (e: unknown) {
      if (signal?.aborted) throw e
      step({ step: 1, title: '解析页面', subtitle: '解析失败', status: 'error', detail: errMsg(e) })
      log(`  ❌ 解析失败: ${errMsg(e)}`)
      return null
    }
  }

  // 转写缓存文件路径（与音频文件同目录，扩展名改为 .transcript.json）
  const transcriptPath = audioPath ? audioPath.replace(/\.[^.]+$/, '') + '.transcript.json' : ''

  check()
  log('  [3/5] 语音转文字 (Whisper)...')

  let transcript: string | null = null

  // 如果已从平台获取字幕/转写文本，直接使用
  if (preTranscript) {
    transcript = preTranscript
    
    step({
      step: 3,
      title: '语音转文字',
      subtitle: `平台字幕 ${transcript.length} 字`,
      status: 'done',
      progress: 100,
      detail: '使用平台字幕，跳过 Whisper',
    })
    log(`  ✅ 使用平台字幕（${transcript.length} 字），跳过 Whisper`)
  } else if (!force && transcriptPath && fs.existsSync(transcriptPath)) {
    try {
      const stat = fs.statSync(transcriptPath)
      if (stat.size < 100) {
        log('  🔄 历史转写文件过小，需要重新转写')
      } else {
        const raw = fs.readFileSync(transcriptPath, 'utf-8')
        const cached = JSON.parse(raw) as { text?: string; charCount?: number; timestamp?: string }
        if (!cached.text || typeof cached.text !== 'string') {
          log('  🔄 历史转写文件格式无效（text 字段缺失），重新转写')
        } else if (cached.text.length < 50) {
          log(`  🔄 历史转写文件内容过短（${cached.text.length} 字），重新转写`)
        } else {
          transcript = cached.text
          
          log(
            `  ✅ 复用历史转写结果（${transcript.length} 字，文件: ${path.basename(transcriptPath)}）`,
          )
          step({
            step: 3,
            title: '语音转文字',
            subtitle: `复用缓存 ${transcript.length} 字`,
            status: 'done',
            progress: 100,
            detail: '使用历史转写结果，跳过 Whisper',
          })
        }
      }
    } catch (e: unknown) {
      log(`  🔄 历史转写文件读取失败（${errMsg(e)}），重新转写`)
      // 清理损坏的缓存文件
      try {
        fs.unlinkSync(transcriptPath)
      } catch {}
    }
  } else if (!force) {
    log('  🔄 未找到 JSON 转写缓存，检查 Whisper 原始输出...')

    // 回退查找 Whisper 生成的 .txt 文件（兼容缓存功能开发前的历史转写结果）
    const txtPath = audioPath.replace(/\.[^.]+$/, '') + '.txt'
    if (fs.existsSync(txtPath)) {
      try {
        const stat = fs.statSync(txtPath)
        if (stat.size < 100) {
          log('  🔄 Whisper .txt 文件过小，需要重新转写')
        } else {
          const txtContent = fs.readFileSync(txtPath, 'utf-8').trim()
          if (txtContent.length < 50) {
            log(`  🔄 Whisper .txt 内容过短（${txtContent.length} 字），重新转写`)
          } else {
            transcript = txtContent
            
            log(
              `  ✅ 复用 Whisper 原始转写结果（${transcript.length} 字，文件: ${path.basename(txtPath)}）`,
            )
            step({
              step: 3,
              title: '语音转文字',
              subtitle: `复用缓存 ${transcript.length} 字`,
              status: 'done',
              progress: 100,
              detail: '使用 Whisper 历史转写结果，跳过 Whisper',
            })

            // 顺便生成 JSON 缓存，下次处理直接命中 JSON 缓存
            try {
              fs.writeFileSync(
                transcriptPath,
                JSON.stringify(
                  {
                    text: transcript,
                    charCount: transcript.length,
                    timestamp: new Date().toISOString(),
                    source: 'whisper-txt-migration',
                  },
                  null,
                  2,
                ),
                'utf-8',
              )
              log(`  💾 已从 .txt 迁移为 JSON 缓存: ${path.basename(transcriptPath)}`)
            } catch (e: unknown) {
              log(`  ⚠ JSON 缓存迁移写入失败（不影响本次处理）: ${errMsg(e)}`)
            }
          }
        }
      } catch (e: unknown) {
        log(`  🔄 Whisper .txt 文件读取失败（${errMsg(e)}），重新转写`)
      }
    } else {
      log('  🔄 未找到任何历史转写文件，执行全新转写')
    }
  } else {
    log('  🔄 强制重新转写模式，跳过缓存检查')
  }

  // 未命中缓存时执行 Whisper 转写
  if (!transcript) {
    step({
      step: 3,
      title: '语音转文字',
      subtitle: 'Whisper 准备中',
      status: 'running',
      detail: '正在加载模型',
    })
    if (!fs.existsSync(audioPath)) {
      step({
        step: 3,
        title: '语音转文字',
        subtitle: '文件丢失',
        status: 'error',
        detail: audioPath,
      })
      log(`  ❌ 音频文件不存在: ${audioPath}`)
      return null
    }
    transcript = await runWhisper(
      audioPath,
      language,
      sendLog,
      status =>
        step({
          step: 3,
          title: '语音转文字',
          subtitle: status.subtitle,
          status: status.phase === 'finalizing' ? 'done' : 'running',
          detail: status.detail,
          progress: status.progress,
        }),
      signal,
    )
    if (!transcript) {
      if (signal?.aborted) throw Object.assign(new Error('已取消'), { name: 'AbortError' })
      step({
        step: 3,
        title: '语音转文字',
        subtitle: '转写失败',
        status: 'error',
        detail: '检查 Whisper 是否正常工作',
      })
      log('  ❌ 语音转文字失败')
      return null
    }
    step({ step: 3, title: '语音转文字', subtitle: `共 ${transcript.length} 字`, status: 'done' })
    log(`  ✓ 转写完成，共 ${transcript.length} 字`)

    // 转写成功后保存缓存（便于后续重处理复用）
    try {
      fs.writeFileSync(
        transcriptPath,
        JSON.stringify(
          {
            text: transcript,
            charCount: transcript.length,
            timestamp: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf-8',
      )
      log(`  💾 转写结果已缓存: ${path.basename(transcriptPath)}`)
    } catch (e: unknown) {
      log(`  ⚠ 转写缓存写入失败（不影响本次处理）: ${errMsg(e)}`)
    }
  }

  check()

  // 在 AI 处理之前校验 obsidianDir，确保输出目录可用
  if (!obsidianDir || !obsidianDir.trim()) {
    step({
      step: 4,
      title: '修正专有名词',
      subtitle: '未配置笔记目录',
      status: 'error',
      detail: '请在设置中配置 Obsidian 笔记目录',
    })
    log('  ❌ 未配置 Obsidian 笔记目录，请在设置中填写 obsidian_dir')
    return null
  }

  if (!providerConfig) {
    step({ step: 4, title: '修正专有名词', subtitle: '未配置 AI 供应商', status: 'error' })
    log('  ❌ 未配置 AI 供应商，跳过 AI 处理')
    return null
  }

  step({ step: 4, title: '修正专有名词', subtitle: 'DeepSeek AI 修正中...', status: 'running' })
  log('  [4/5] 修正专有名词 (DeepSeek)...')
  let finalTranscript = transcript
  const CORRECTION_SKIP_THRESHOLD = 15000
  if (transcript.length > CORRECTION_SKIP_THRESHOLD) {
    step({
      step: 4,
      title: '修正专有名词',
      subtitle: '跳过（转写过长）',
      status: 'done',
      detail: `${transcript.length} 字，超过 ${CORRECTION_SKIP_THRESHOLD} 字阈值，直接使用原始转写`,
    })
    log(`  ⏭ 转写过长（${transcript.length} 字），跳过修正步骤`)
  } else {
    try {
      const correction = await correctTranscript(
        providerConfig,
        providerId as AIProviderId,
        transcript,
        signal,
      )
      if (correction.content) {
        finalTranscript = correction.content
        step({
          step: 4,
          title: '修正专有名词',
          subtitle: `≈¥${correction.cost.toFixed(4)}`,
          status: 'done',
        })
        log(`  ✓ 修正完成 (≈¥${correction.cost.toFixed(4)})`)
      } else {
        step({ step: 4, title: '修正专有名词', subtitle: '跳过（使用原始转录）', status: 'done' })
        log('  ⚠ 修正失败，使用原始转录')
      }
    } catch (e: unknown) {
      if (signal?.aborted) throw e
      step({ step: 4, title: '修正专有名词', subtitle: 'API 异常，使用原始转录', status: 'done' })
      log(`  ⚠ DeepSeek 修正异常: ${errMsg(e)}，使用原始转录`)
    }
  }

  check()
  step({ step: 5, title: 'AI 提炼笔记', subtitle: 'DeepSeek 生成中...', status: 'running' })
  log('  [5/5] AI 提炼笔记 (DeepSeek)...')
  let notes: { content: string | null; cost: number }
  try {
    notes = await generateNotes(
      providerConfig,
      providerId as AIProviderId,
      finalTranscript,
      signal,
      platformMetadata,
      (current, total) => {
        step({
          step: 5,
          title: 'AI 提炼笔记',
          subtitle: `分段处理 (${current}/${total})...`,
          status: 'running',
        })
      },
    )
  } catch (e: unknown) {
    step({
      step: 5,
      title: 'AI 提炼笔记',
      subtitle: 'API 异常',
      status: 'error',
      detail: errMsg(e),
    })
    log(`  ❌ DeepSeek 生成异常: ${errMsg(e)}`)
    return null
  }
  if (!notes.content) {
    const fr = (notes as { finishReason?: string }).finishReason
    const detail = fr ? `finish_reason=${fr}` : 'AI 返回空内容'
    step({ step: 5, title: 'AI 提炼笔记', subtitle: '提炼失败', status: 'error', detail })
    log(`  ❌ AI 提炼失败（${detail}）`)
    return null
  }
  step({ step: 5, title: 'AI 提炼笔记', subtitle: `≈¥${notes.cost.toFixed(4)}`, status: 'done' })
  log(`  ✓ 提炼完成 (≈¥${notes.cost.toFixed(4)})`)

  // 质量评估
  const qScore = evaluateQuality(finalTranscript, notes.content)
  const scoreLabel =
    qScore.overall >= 60 ? `质量 ${qScore.overall}/100` : `⚠ 质量 ${qScore.overall}/100（建议复核）`
  step({
    step: 5,
    title: 'AI 提炼笔记',
    subtitle: `≈¥${notes.cost.toFixed(4)} | ${scoreLabel}`,
    status: 'done',
  })
  log(
    `  📊 质量评分: ${qScore.overall}/100（覆盖 ${qScore.contentCoverage}% | 实体 ${qScore.entityCompleteness}% | 链接 ${qScore.wikiLinkCoverage}% | 格式 ${qScore.formatCompliance}%）`,
  )
  if (qScore.details.length > 0) {
    for (const d of qScore.details) log(`     ${d}`)
  }

  const entities = parseEntityBlocks(notes.content)
  const { entities: patchedEntities, filled: filledTerms } = fillMissingTermCards(
    notes.content,
    entities,
  )
  if (filledTerms > 0) {
    log(`  ⚠ 检测到 ${filledTerms} 个术语在词典中存在但缺少卡片，已自动补全`)
  }

  // 为正文中有 wiki-link 但没有卡片的实体自动补上概念卡片
  const bodyLinks = extractBodyWikiLinks(notes.content)
  const { entities: finalEntities, filled: filledLinks } = fillMissingEntityCards(
    patchedEntities,
    bodyLinks,
  )
  if (filledLinks > 0) {
    log(`  📎 为正文中 ${filledLinks} 个链接自动创建了概念卡片`)
  }

  // 确保 Obsidian 笔记目录存在（在写入任何文件之前）
  const obsDir = obsidianDir.trim()
  if (!fs.existsSync(obsDir)) {
    fs.mkdirSync(obsDir, { recursive: true })
    log(`  📁 已创建笔记目录: ${obsDir}`)
  }

  if (
    finalEntities.people.length ||
    finalEntities.projects.length ||
    finalEntities.concepts.length ||
    finalEntities.terms.length
  ) {
    // 从笔记 frontmatter 中提取 date 和 episode 用于"近期提及"
    let podcastDate = ''
    let podcastEpisode = ''
    const fmMatch = (notes.content || '').match(/^---\s*\n([\s\S]*?)\n---/)
    if (fmMatch) {
      const dateM = fmMatch[1].match(/^date:\s*(.+)$/m)
      const epM = fmMatch[1].match(/^episode:\s*(.+)$/m)
      if (dateM) podcastDate = dateM[1].trim()
      if (epM) podcastEpisode = epM[1].trim()
    }
    const cardResult = await writeEntityNotes(
      {
        entities: finalEntities,
        obsidianDir: obsDir,
        podcastFilename: `${cleanTitleForFilename(title || '未命名播客')}.md`,
        podcastTitle: title || '未命名播客',
        podcastDate,
        podcastEpisode,
        apiKey: providerConfig?.apiKey,
        providerConfig,
        providerId: providerId as AIProviderId,
        onProgress: msg => log(msg),
      },
      signal,
    )
    const parts: string[] = []
    if (cardResult.peopleWritten) parts.push(`${cardResult.peopleWritten} 人物`)
    if (cardResult.projectsWritten) parts.push(`${cardResult.projectsWritten} 项目`)
    if (cardResult.conceptsWritten) parts.push(`${cardResult.conceptsWritten} 概念`)
    if (cardResult.termsWritten) parts.push(`${cardResult.termsWritten} 术语`)
    if (cardResult.termToConcept) {
      const searchInfo =
        cardResult.conceptSearched > 0 ? `（${cardResult.conceptSearched} 个已联网获取定义）` : ''
      parts.push(`${cardResult.termToConcept} 术语→概念${searchInfo}`)
    }
    log(`  🃏 生成实体卡片: ${parts.join(', ')}`)
  }

  const filename = cleanTitleForFilename(title || '未命名播客')

  // 解析笔记中的 category 字段，按分类存储到对应文件夹
  const category = parseCategory(notes.content || '')
  let targetDir = obsDir

  if (category) {
    // 安全检查：category 来自 AI 输出（不可信来源），需防止路径遍历
    const cleanedCategory = category
      .replace(/\.\./g, '') // 移除 .. 防止路径遍历
      .replace(/[<>:"|?*\x00-\x1f]/g, '_') // 移除非法字符
      .trim()

    if (cleanedCategory && !cleanedCategory.includes('/') && !cleanedCategory.includes('\\')) {
      const candidateDir = path.join(obsDir, cleanedCategory)
      // 二次验证：确保解析后的路径仍在 obsDir 范围内
      if (isSubPathOf(candidateDir, obsDir)) {
        targetDir = candidateDir
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
          log(`  📁 已创建分类文件夹: ${cleanedCategory}`)
        }
        log(`  📂 笔记分类: ${cleanedCategory}`)
      } else {
        log(`  ⚠ 分类路径不安全，已忽略: ${category}`)
      }
    } else {
      log(`  ⚠ 分类名称包含非法字符，已忽略: ${category}`)
    }
  } else {
    log(`  ⚠ 未检测到分类信息，笔记将保存到根目录`)
  }

  const filepath = path.join(targetDir, `${filename}.md`)
  fs.writeFileSync(filepath, notes.content, 'utf-8')

  log(`  📝 笔记已保存: ${path.relative(obsDir, filepath)}`)
  return path.relative(obsDir, filepath)
}
