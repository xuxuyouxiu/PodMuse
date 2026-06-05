import { describe, it, expect } from 'vitest'
import { parseEntityBlocks, sanitizeName, filterNonNotablePeople } from '../src/main/entity-cards'
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

describe('filterNonNotablePeople', () => {
  it('filters out non-notable roles', () => {
    const entities: EntityResult = {
      people: [
        { name: '张三', role: '自媒体' },
        { name: '李四', role: 'AI研究员' },
        { name: '王五', role: '博主' },
      ],
      projects: [], concepts: [], terms: [],
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
      projects: [], concepts: [], terms: [],
    }
    const result = filterNonNotablePeople(entities)
    expect(result.people.length).toBe(1)
    expect(result.people[0].name).toBe('张三')
  })
  it('filters people without role', () => {
    const entities: EntityResult = {
      people: [{ name: '无名', role: undefined }],
      projects: [], concepts: [], terms: [],
    }
    const result = filterNonNotablePeople(entities)
    expect(result.people.length).toBe(0)
  })
})
