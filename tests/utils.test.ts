import { describe, it, expect } from 'vitest'
import { cleanTitle, sanitizeFilename, cleanTitleForFilename } from '../src/shared/utils'

describe('cleanTitle', () => {
  it('removes episode prefix (第X期)', () => {
    expect(cleanTitle('第42期 - 人工智能的未来')).toBe('人工智能的未来')
  })
  it('removes EP prefix', () => {
    expect(cleanTitle('EP01 - 创业故事')).toBe('创业故事')
  })
  it('removes Vol prefix', () => {
    expect(cleanTitle('Vol5 聊聊设计')).toBe('聊聊设计')
  })
  it('removes date prefix', () => {
    expect(cleanTitle('2024-01-15 技术漫谈')).toBe('技术漫谈')
  })
  it('removes trailing date', () => {
    expect(cleanTitle('技术漫谈 2024-01-15')).toBe('技术漫谈')
  })
  it('handles empty string', () => {
    expect(cleanTitle('')).toBe('')
  })
  it('generates unique fallback when cleaning results in empty', () => {
    expect(cleanTitle('第1期')).toMatch(/^未命名播客_\d{14}$/)
  })
  it('truncates long titles', () => {
    const long = 'A'.repeat(60)
    const result = cleanTitle(long)
    expect(result.length).toBeLessThanOrEqual(54) // 50 + '...'
    expect(result.endsWith('...')).toBe(true)
  })
  it('removes file path prefix', () => {
    expect(cleanTitle('C:\\Users\\test\\podcast_ep01.mp3')).toBe('podcast_ep01')
  })
})

describe('sanitizeFilename', () => {
  it('removes illegal characters', () => {
    expect(sanitizeFilename('test<>:"/\\|?*file')).toBe('test_________file')
  })
  it('trims whitespace', () => {
    expect(sanitizeFilename('  hello  ')).toBe('hello')
  })
  it('handles clean input', () => {
    expect(sanitizeFilename('normal-name_123')).toBe('normal-name_123')
  })
})

describe('cleanTitleForFilename', () => {
  it('combines cleanTitle and sanitizeFilename', () => {
    expect(cleanTitleForFilename('第5期 - AI 前沿')).toBe('AI 前沿')
  })
  it('returns fallback for empty', () => {
    expect(cleanTitleForFilename('')).toBe('未命名播客')
  })
})
