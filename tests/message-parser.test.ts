import { describe, it, expect } from 'vitest'
import { MessageParser } from '../src/main/message-parser'

describe('MessageParser', () => {
  const parser = new MessageParser()

  it('extracts podcast URL from text message', () => {
    const messages = [{
      message_id: 'msg1',
      msg_type: 'text',
      body: { content: JSON.stringify({ text: '听听这个 https://www.xiaoyuzhoufm.com/episode/abc123 很不错' }) },
    }]
    const result = parser.extract(messages)
    expect(result.length).toBe(1)
    expect(result[0].kind).toBe('podcast')
    expect(result[0].url).toBe('https://www.xiaoyuzhoufm.com/episode/abc123')
    expect(result[0].episodeId).toBe('abc123')
  })

  it('ignores non-podcast messages', () => {
    const messages = [{
      message_id: 'msg2',
      msg_type: 'text',
      body: { content: JSON.stringify({ text: '今天天气不错' }) },
    }]
    const result = parser.extract(messages)
    expect(result[0].kind).toBe('ignore')
  })

  it('ignores non-text message types', () => {
    const messages = [{
      message_id: 'msg3',
      msg_type: 'image',
      body: { content: '{}' },
    }]
    const result = parser.extract(messages)
    expect(result[0].kind).toBe('ignore')
  })

  it('handles plain text content (non-JSON)', () => {
    const messages = [{
      message_id: 'msg4',
      msg_type: 'text',
      body: { content: 'check https://www.xiaoyuzhoufm.com/episode/xyz' },
    }]
    const result = parser.extract(messages)
    expect(result[0].kind).toBe('podcast')
    expect(result[0].episodeId).toBe('xyz')
  })

  it('handles empty messages array', () => {
    const result = parser.extract([])
    expect(result).toEqual([])
  })
})
