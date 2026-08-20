/**
 * 剪贴板无感填充匹配纯函数测试（matchPatterns）。
 * hook 本体依赖 window.electronAPI，不在本测试内驱动；
 * 匹配逻辑抽成纯函数导出并测试（docs/无感配置方案.md §3.3 的每步正则场景）。
 */
import { describe, it, expect } from 'vitest'
import { matchPatterns, type ClipPattern } from '../src/renderer/hooks/useClipboardFill'

describe('matchPatterns', () => {
  const skPattern: ClipPattern = { id: 'sk-key', regex: /sk-[A-Za-z0-9_-]{8,}/ }
  const cliPattern: ClipPattern = { id: 'cli-id', regex: /^cli_[a-z0-9]{8,}$/i }

  it('命中 pattern，value 为 trim 后的文本', () => {
    const m = matchPatterns('  sk-abcdef123456  ', [skPattern])
    expect(m).toEqual({ id: 'sk-key', value: 'sk-abcdef123456' })
  })

  it('按数组顺序返回首个命中', () => {
    const m = matchPatterns('sk-abcdef123456', [cliPattern, skPattern])
    expect(m?.id).toBe('sk-key')
  })

  it('空文本 / 空白文本返回 null', () => {
    expect(matchPatterns('', [skPattern])).toBeNull()
    expect(matchPatterns('   ', [skPattern])).toBeNull()
  })

  it('无命中返回 null', () => {
    expect(matchPatterns('hello world', [skPattern, cliPattern])).toBeNull()
  })

  it('/g 正则不残留 lastIndex 状态（可重复命中）', () => {
    const gPattern: ClipPattern = { id: 'g', regex: /sk-[a-z]+/g }
    expect(matchPatterns('sk-abc', [gPattern])?.id).toBe('g')
    expect(matchPatterns('sk-abc', [gPattern])?.id).toBe('g')
  })

  it('extract 从文本提取实际值（如 URL 中的 32 位 id）', () => {
    const urlPattern: ClipPattern = {
      id: 'notion-db-id',
      regex: /notion\.so\//,
      extract: text => {
        const m = text.match(/[0-9a-f]{32}/i)
        return m ? m[0] : null
      },
    }
    const m = matchPatterns('https://www.notion.so/ws/abc123def456abc123def456abc123de', [
      urlPattern,
    ])
    expect(m).toEqual({ id: 'notion-db-id', value: 'abc123def456abc123def456abc123de' })
  })

  it('extract 返回 null / 空串时跳过该 pattern', () => {
    const p: ClipPattern = { id: 'p', regex: /x/, extract: () => null }
    expect(matchPatterns('x', [p])).toBeNull()
    const p2: ClipPattern = { id: 'p2', regex: /x/, extract: () => '   ' }
    expect(matchPatterns('x', [p2])).toBeNull()
  })

  it('异常 pattern 不抛出（跳过并继续后续匹配）', () => {
    const bad: ClipPattern = {
      id: 'bad',
      get regex(): RegExp {
        throw new Error('boom')
      },
    }
    expect(matchPatterns('sk-abcdef123456', [bad, skPattern])?.id).toBe('sk-key')
  })
})
