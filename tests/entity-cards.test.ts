import { describe, it, expect } from 'vitest'
import {
  parseEntityBlocks,
  sanitizeName,
  filterNonNotablePeople,
  encodeMarkdownLinkPath,
  normalizeEntityLinks,
  convertWikiLinks,
} from '../src/main/entity-cards'
import type { EntityResult } from '../src/main/entity-cards'

describe('sanitizeName', () => {
  it('removes illegal characters', () => {
    expect(sanitizeName('test<>:"/\\|?*name')).toBe('test_________name')
  })
  it('removes .. sequences', () => {
    expect(sanitizeName('test..name')).toBe('test_name')
  })
  it('removes trailing dots', () => {
    // '..' is replaced first -> 'test_.', then trailing dot removed -> 'test_'
    expect(sanitizeName('test...')).toBe('test_')
  })
  it('truncates to 100 chars', () => {
    const long = 'A'.repeat(150)
    expect(sanitizeName(long).length).toBe(100)
  })
  it('returns fallback for fully sanitized input', () => {
    // '...' -> '..' replaced with '_' -> '_.', trailing '.' removed -> '_' (truthy, not empty)
    expect(sanitizeName('...')).toBe('_')
  })
  it('returns fallback for truly empty result', () => {
    // Whitespace-only input becomes empty after trim
    expect(sanitizeName('   ')).toBe('未命名')
  })
})

describe('parseEntityBlocks', () => {
  it('parses people cards', () => {
    const md = `---CARD-PEOPLE---
姓名：张三
角色：AI研究员
核心观点：
  大模型将改变一切
---CARD-PEOPLE-END---`
    const result = parseEntityBlocks(md)
    expect(result.people.length).toBe(1)
    expect(result.people[0].name).toBe('张三')
    expect(result.people[0].role).toBe('AI研究员')
  })
  it('parses concept cards', () => {
    const md = `---CARD-CONCEPT---
概念名称：Transformer
核心解释：一种神经网络架构
相关概念：[[Attention]], [[BERT]]
---CARD-CONCEPT-END---`
    const result = parseEntityBlocks(md)
    expect(result.concepts.length).toBe(1)
    expect(result.concepts[0].name).toBe('Transformer')
    expect(result.concepts[0].related).toEqual(['Attention', 'BERT'])
  })
  it('returns empty for no blocks', () => {
    const result = parseEntityBlocks('just some text')
    expect(result.people).toEqual([])
    expect(result.projects).toEqual([])
    expect(result.concepts).toEqual([])
    expect(result.terms).toEqual([])
  })
})

describe('encodeMarkdownLinkPath', () => {
  it('encodes spaces and unsafe chars, keeps slashes and CJK', () => {
    expect(encodeMarkdownLinkPath('../项目/Five Guys.md')).toBe('../项目/Five%20Guys.md')
    expect(encodeMarkdownLinkPath('术语/M Stand.md')).toBe('术语/M%20Stand.md')
    expect(encodeMarkdownLinkPath('../术语/A#B.md')).toBe('../术语/A%23B.md')
    expect(encodeMarkdownLinkPath('../项目/SOP (Standard).md')).toBe(
      '../项目/SOP%20%28Standard%29.md',
    )
  })
  it('leaves safe paths untouched', () => {
    expect(encodeMarkdownLinkPath('../项目/海底捞.md')).toBe('../项目/海底捞.md')
  })
})

describe('normalizeEntityLinks 空格文件名（英文实体链接修复）', () => {
  const obsDir = 'G:/notes'
  const noteDir = 'G:/notes/每日资讯'

  it('encodes spaces in regenerated relative paths', () => {
    const md = '[Five Guys](../项目/Five Guys.md)、[海底捞](../项目/海底捞.md)'
    const out = normalizeEntityLinks(md, noteDir, obsDir)
    expect(out).toContain('[Five Guys](../项目/Five%20Guys.md)')
    expect(out).toContain('[海底捞](../项目/海底捞.md)')
  })

  it('is idempotent on already-encoded links', () => {
    const md = '[Five Guys](../项目/Five%20Guys.md)'
    const out = normalizeEntityLinks(md, noteDir, obsDir)
    expect(out).toBe('[Five Guys](../项目/Five%20Guys.md)')
  })

  it('strips directory prefix from link text', () => {
    const md = '[项目/Five Guys](../项目/Five Guys.md)'
    const out = normalizeEntityLinks(md, noteDir, obsDir)
    expect(out).toBe('[Five Guys](../项目/Five%20Guys.md)')
  })
})

describe('convertWikiLinks 带目录前缀与未收录名称', () => {
  const noteDir = 'G:/notes/每日资讯'
  const map = new Map<string, string>([
    ['Five Guys', 'G:/notes/项目/Five Guys.md'],
    ['张雪机车', 'G:/notes/项目/张雪机车.md'],
  ])

  it('encodes spaces in destination', () => {
    const out = convertWikiLinks('[[Five Guys]]', noteDir, map)
    expect(out).toBe('[Five Guys](../项目/Five%20Guys.md)')
  })

  it('strips entity-dir prefix before lookup', () => {
    const out = convertWikiLinks('[[项目/张雪机车]]', noteDir, map)
    expect(out).toBe('[张雪机车](../项目/张雪机车.md)')
  })

  it('degrades unknown names to plain text instead of a broken link', () => {
    const out = convertWikiLinks('[[不存在的东西]]', noteDir, map)
    expect(out).toBe('不存在的东西')
  })
})

describe('filterNonNotablePeople', () => {
  it('filters out non-notable roles', () => {
    const entities: EntityResult = {
      people: [
        { name: '张三', role: '自媒体' },
        { name: '李四', role: 'AI研究员' },
        { name: '王五', role: '博主' },
      ],
      projects: [],
      concepts: [],
      terms: [],
    }
    const result = filterNonNotablePeople(entities)
    expect(result.people.length).toBe(1)
    expect(result.people[0].name).toBe('李四')
  })
  it('filters out non-notable names', () => {
    const entities: EntityResult = {
      people: [
        { name: '小明妈妈', role: '教师' },
        { name: '张三', role: '教授' },
      ],
      projects: [],
      concepts: [],
      terms: [],
    }
    const result = filterNonNotablePeople(entities)
    expect(result.people.length).toBe(1)
    expect(result.people[0].name).toBe('张三')
  })
  it('filters people without role', () => {
    const entities: EntityResult = {
      people: [{ name: '无名', role: undefined }],
      projects: [],
      concepts: [],
      terms: [],
    }
    const result = filterNonNotablePeople(entities)
    expect(result.people.length).toBe(0)
  })
})
