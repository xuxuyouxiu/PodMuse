/**
 * 设置页剪贴板字段识别纯函数测试（extractFieldValue）。
 * 覆盖 cli_ / oc_ / secret_ / 32 位 hex 四类 + 边界（混入空格/换行/前后缀文字）。
 */
import { describe, it, expect } from 'vitest'
import { extractFieldValue } from '../src/renderer/data/clipboard-field-patterns'

describe('extractFieldValue', () => {
  it('飞书 App ID：cli_ 前缀', () => {
    expect(extractFieldValue('cli_a1b2c3d4e5f6', 'feishu-app-id')).toBe('cli_a1b2c3d4e5f6')
  })

  it('飞书 Chat ID：oc_ 前缀', () => {
    expect(extractFieldValue('oc_0123456789abcdef0123456789abcdef', 'feishu-chat-id')).toBe(
      'oc_0123456789abcdef0123456789abcdef',
    )
  })

  it('Notion token：旧版 secret_ 与新版 ntn_ 前缀都识别', () => {
    expect(extractFieldValue('secret_AbCdEfGh1234567890abcdefgh', 'notion-token')).toBe(
      'secret_AbCdEfGh1234567890abcdefgh',
    )
    expect(extractFieldValue('ntn_I4208413973bbAQSFxTqxP15Ct8xsp2KAB0SBzkzZucdf2', 'notion-token')).toBe(
      'ntn_I4208413973bbAQSFxTqxP15Ct8xsp2KAB0SBzkzZucdf2',
    )
    expect(extractFieldValue('连接令牌: ntn_AbCdEfGh1234567890', 'notion-token')).toBe(
      'ntn_AbCdEfGh1234567890',
    )
  })

  it('Notion database ID：32 位 hex', () => {
    expect(extractFieldValue('abcdef0123456789abcdef0123456789', 'notion-database-id')).toBe(
      'abcdef0123456789abcdef0123456789',
    )
  })

  it('边界：混入空格/换行/前后缀文字仍能提取', () => {
    expect(extractFieldValue('  飞书 App ID: cli_a1b2c3d4e5f6\n复制成功  ', 'feishu-app-id')).toBe(
      'cli_a1b2c3d4e5f6',
    )
    expect(extractFieldValue('群聊：oc_abc123def456\n', 'feishu-chat-id')).toBe('oc_abc123def456')
    expect(extractFieldValue('token=secret_AbCd1234efGh\n', 'notion-token')).toBe(
      'secret_AbCd1234efGh',
    )
    expect(
      extractFieldValue(
        'https://www.notion.so/ws/abcdef0123456789abcdef0123456789?v=2',
        'notion-database-id',
      ),
    ).toBe('abcdef0123456789abcdef0123456789')
  })

  it('值紧邻字母数字不截取（边界不成立）', () => {
    expect(extractFieldValue('xcli_abcdefgh1234', 'feishu-app-id')).toBeNull()
    expect(extractFieldValue('myoc_abcdefgh1234', 'feishu-chat-id')).toBeNull()
    expect(extractFieldValue('nosecret_abcdefgh1234', 'notion-token')).toBeNull()
    expect(extractFieldValue('xntn_abcdefgh12345678', 'notion-token')).toBeNull()
  })

  it('长度不足不命中', () => {
    expect(extractFieldValue('cli_abc', 'feishu-app-id')).toBeNull()
    expect(extractFieldValue('oc_abc', 'feishu-chat-id')).toBeNull()
    expect(extractFieldValue('secret_abc', 'notion-token')).toBeNull()
    expect(extractFieldValue('abc123', 'notion-database-id')).toBeNull()
  })

  it('database id：32 位 hex 与 36 位 UUID（带连字符）都识别', () => {
    expect(
      extractFieldValue('abcdef0123456789abcdef0123456789', 'notion-database-id'),
    ).toBe('abcdef0123456789abcdef0123456789')
    expect(
      extractFieldValue('https://www.notion.com/我的工作区/248104cd-477e-80af-bc30-000bd28de8f9?v=1', 'notion-database-id'),
    ).toBe('248104cd-477e-80af-bc30-000bd28de8f9')
  })

  it('33+ 位连续 hex 不误吞（首尾边界不成立）', () => {
    expect(
      extractFieldValue('abcdef0123456789abcdef0123456789abcd', 'notion-database-id'),
    ).toBeNull()
  })

  it('kind 互不串扰', () => {
    expect(extractFieldValue('cli_a1b2c3d4e5f6', 'feishu-chat-id')).toBeNull()
    expect(extractFieldValue('secret_AbCd1234efGh', 'feishu-app-id')).toBeNull()
    expect(extractFieldValue('abcdef0123456789abcdef0123456789', 'notion-token')).toBeNull()
    expect(extractFieldValue('oc_abc123def456', 'notion-database-id')).toBeNull()
  })

  it('大小写宽松：大写前缀也可识别且保留原值', () => {
    expect(extractFieldValue('CLI_ABC12345678', 'feishu-app-id')).toBe('CLI_ABC12345678')
    expect(extractFieldValue('SECRET_abc12345678', 'notion-token')).toBe('SECRET_abc12345678')
  })

  it('空文本 / 空白文本返回 null', () => {
    expect(extractFieldValue('', 'feishu-app-id')).toBeNull()
    expect(extractFieldValue('   \n  ', 'notion-database-id')).toBeNull()
  })
})
