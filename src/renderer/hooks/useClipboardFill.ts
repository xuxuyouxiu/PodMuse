/**
 * 剪贴板无感填充 hook（docs/无感配置方案.md §3.3）：
 * active 期间每 1s 轮询 clipboard:readText，命中 pattern 即回调 onFill(value)。
 * 非 active 或组件卸载立即停止轮询。
 * 安全约束：绝不写日志内容——日志只记录命中类型 id 与读取失败原因。
 */
import { useEffect, useRef } from 'react'

export interface ClipPattern {
  /** 命中类型标识（日志只记录该值，绝不记录剪贴板内容） */
  id: string
  /** 匹配正则（lastIndex 会被重置，/g 状态不残留） */
  regex: RegExp
  /** 可选：命中后从文本中提取实际值；省略时值为剪贴板文本（trim 后） */
  extract?: (text: string) => string | null
}

export interface ClipMatch {
  id: string
  value: string
}

/** 纯函数：按顺序返回第一个命中的 pattern；无命中返回 null */
export function matchPatterns(text: string, patterns: ClipPattern[]): ClipMatch | null {
  const trimmed = (text || '').trim()
  if (!trimmed) return null
  for (const p of patterns) {
    try {
      p.regex.lastIndex = 0
      if (!p.regex.test(trimmed)) continue
      if (p.extract) {
        const extracted = p.extract(trimmed)
        if (extracted === null || extracted === undefined) continue
        const value = extracted.trim()
        if (!value) continue
        return { id: p.id, value }
      }
      return { id: p.id, value: trimmed }
    } catch {
      continue
    }
  }
  return null
}

export function useClipboardFill({
  active,
  patterns,
  onFill,
  intervalMs = 1000,
}: {
  active: boolean
  patterns: ClipPattern[]
  onFill: (value: string) => void
  intervalMs?: number
}): void {
  const patternsRef = useRef(patterns)
  const onFillRef = useRef(onFill)
  const lastTextRef = useRef('')
  const lastHitIdRef = useRef<string | null>(null)

  // 最新 patterns / onFill 同步进 ref（refs 只能在 effect 里更新）
  useEffect(() => {
    patternsRef.current = patterns
    onFillRef.current = onFill
  }, [patterns, onFill])

  useEffect(() => {
    if (!active) return

    const tick = async () => {
      let text = ''
      try {
        text = await window.electronAPI.readClipboardText()
      } catch (e) {
        // 只记录读取失败原因，绝不记录剪贴板内容
        console.warn('[clipfill] clipboard read failed:', (e as Error)?.message)
        return
      }
      if (!text) return
      const match = matchPatterns(text, patternsRef.current)
      if (!match) return
      if (text === lastTextRef.current) return // 同一内容只回填一次
      lastTextRef.current = text
      if (match.id !== lastHitIdRef.current) {
        console.log('[clipfill] pattern hit:', match.id) // 只记录命中类型
      }
      lastHitIdRef.current = match.id
      onFillRef.current(match.value)
    }

    void tick()
    const timer = setInterval(() => void tick(), intervalMs)
    return () => clearInterval(timer)
  }, [active, intervalMs])

  // 停止时重置去重状态，下次激活可重新识别同一内容
  useEffect(() => {
    if (!active) {
      lastTextRef.current = ''
      lastHitIdRef.current = null
    }
  }, [active])
}
