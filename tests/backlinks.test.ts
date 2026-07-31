import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  parseFrontmatter,
  extractWikiLinks,
  normalizeLinkName,
  buildBacklinkIndex,
} from '../src/main/backlinks'
import type { BacklinkIndex } from '../src/main/backlinks'

// ── Helpers ─────────────────────────────────────────────

let tmpDir: string

function createTmpDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlinks-test-'))
  return tmpDir
}

function writeFile(relPath: string, content: string) {
  const full = path.join(tmpDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

function removeDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// ── parseFrontmatter ────────────────────────────────────

describe('parseFrontmatter', () => {
  beforeEach(() => createTmpDir())
  afterEach(() => removeDir(tmpDir))

  it('parses standard frontmatter fields', () => {
    const filePath = path.join(tmpDir, 'test.md')
    const content = `---
date: 2024-06-15
category: 科技商业
show: 硅谷早知道
type: podcast
episode: E123
title: AI前沿对话
host: 张三
guest: 李四
platform: 小宇宙
---

正文内容`
    fs.writeFileSync(filePath, content, 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta.date).toBe('2024-06-15')
    expect(meta.category).toBe('科技商业')
    expect(meta.show).toBe('硅谷早知道')
    expect(meta.type).toBe('podcast')
    expect(meta.episode).toBe('E123')
    expect(meta.title).toBe('AI前沿对话')
    expect(meta.host).toBe('张三')
    expect(meta.guest).toBe('李四')
    expect(meta.platform).toBe('小宇宙')
  })

  it('parses tags as array', () => {
    const filePath = path.join(tmpDir, 'tags.md')
    const content = `---
tags: [AI, 创业, 大语言模型]
date: 2024-01-01
---

正文`
    fs.writeFileSync(filePath, content, 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta.tags).toEqual(['AI', '创业', '大语言模型'])
  })

  it('strips surrounding quotes from values', () => {
    const filePath = path.join(tmpDir, 'quoted.md')
    const content = `---
title: "带引号的标题"
show: '单引号节目'
date: 2024-03-01
---

正文`
    fs.writeFileSync(filePath, content, 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta.title).toBe('带引号的标题')
    expect(meta.show).toBe('单引号节目')
  })

  it('returns empty object for file without frontmatter', () => {
    const filePath = path.join(tmpDir, 'nofm.md')
    fs.writeFileSync(filePath, '# Just a heading\n\nSome content', 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta).toEqual({})
  })

  it('returns empty object for unclosed frontmatter', () => {
    const filePath = path.join(tmpDir, 'unclosed.md')
    fs.writeFileSync(filePath, '---\ndate: 2024-01-01\nstill going', 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta).toEqual({})
  })

  it('returns empty object for non-existent file', () => {
    const meta = parseFrontmatter(path.join(tmpDir, 'nope.md'))
    expect(meta).toEqual({})
  })

  it('ignores unknown keys gracefully', () => {
    const filePath = path.join(tmpDir, 'unknown.md')
    const content = `---
date: 2024-01-01
somekey: somevalue
custom_field: hello
---

正文`
    fs.writeFileSync(filePath, content, 'utf-8')
    const meta = parseFrontmatter(filePath)
    expect(meta.date).toBe('2024-01-01')
    // unknown keys are silently ignored
    expect((meta as any).somekey).toBeUndefined()
  })
})

// ── extractWikiLinks ────────────────────────────────────

describe('extractWikiLinks', () => {
  it('extracts basic [[wiki-links]]', () => {
    const content = 'See [[张三]] and [[李四]] for details.'
    expect(extractWikiLinks(content)).toEqual(['张三', '李四'])
  })

  it('ignores aliased links (extracts target name only)', () => {
    const content = '[[真实名称|显示别名]]'
    const links = extractWikiLinks(content)
    expect(links).toEqual(['真实名称'])
  })

  it('handles mixed aliased and plain links', () => {
    const content = '[[张三]] said [[AI|人工智能]] is the future.'
    expect(extractWikiLinks(content)).toEqual(['张三', 'AI'])
  })

  it('returns empty array for content without links', () => {
    expect(extractWikiLinks('No links here.')).toEqual([])
    expect(extractWikiLinks('')).toEqual([])
  })

  it('extracts links with dots, spaces, and special chars', () => {
    const content = '[[EP01 - AI前沿]] and [[Vol.5 设计]]'
    const links = extractWikiLinks(content)
    expect(links).toEqual(['EP01 - AI前沿', 'Vol.5 设计'])
  })

  it('handles multiple links on the same line', () => {
    const content = '[[A]][[B]][[C]]'
    expect(extractWikiLinks(content)).toEqual(['A', 'B', 'C'])
  })

  it('handles links across multiple lines', () => {
    const content = `第一行 [[Alice]]
第二行 [[Bob]]
第三行 [[Charlie]]`
    expect(extractWikiLinks(content)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('does not match malformed brackets', () => {
    expect(extractWikiLinks('[not a link]')).toEqual([])
    expect(extractWikiLinks('[[incomplete')).toEqual([])
    expect(extractWikiLinks('incomplete]]')).toEqual([])
  })
})

// ── normalizeLinkName ───────────────────────────────────

describe('normalizeLinkName', () => {
  it('trims whitespace', () => {
    expect(normalizeLinkName('  hello  ')).toBe('hello')
  })

  it('removes trailing dots', () => {
    expect(normalizeLinkName('title...')).toBe('title')
    expect(normalizeLinkName('title.')).toBe('title')
  })

  it('removes trailing ellipsis characters', () => {
    expect(normalizeLinkName('title…')).toBe('title')
    // ⋯ (U+22EF) is NOT in the normalize set; only … (U+2026) is
    expect(normalizeLinkName('title⋯')).toBe('title⋯')
  })

  it('removes trailing middle dot', () => {
    expect(normalizeLinkName('title·')).toBe('title')
  })

  it('handles already clean input', () => {
    expect(normalizeLinkName('normal-name')).toBe('normal-name')
  })
})

// ── buildBacklinkIndex ──────────────────────────────────

describe('buildBacklinkIndex', () => {
  beforeEach(() => createTmpDir())
  afterEach(() => removeDir(tmpDir))

  it('returns empty array for non-existent directory', () => {
    expect(buildBacklinkIndex('/no/such/dir')).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(buildBacklinkIndex('')).toEqual([])
  })

  it('builds index from entity files linking to podcast notes', () => {
    // Create a podcast note with frontmatter
    writeFile('科技商业/AI对话2024.md', `---
date: 2024-06-15
category: 科技商业
show: 硅谷早知道
episode: E123
---

今天和[[张三]]讨论了AI的未来。`)

    // Create an entity file with wiki-links
    writeFile('人物/张三.md', `---
type: people
---

[[AI对话2024]]`)

    const index = buildBacklinkIndex(tmpDir)

    expect(index.length).toBe(1)
    expect(index[0].entityName).toBe('张三')
    expect(index[0].entityType).toBe('people')
    expect(index[0].podcastRefs.length).toBe(1)
    expect(index[0].podcastRefs[0].title).toBe('AI对话2024')
    expect(index[0].podcastRefs[0].date).toBe('2024-06-15')
    expect(index[0].podcastRefs[0].category).toBe('科技商业')
    expect(index[0].podcastRefs[0].show).toBe('硅谷早知道')
    expect(index[0].podcastRefs[0].episode).toBe('E123')
  })

  it('handles all entity types (people, projects, concepts, terms)', () => {
    // Podcast note
    writeFile('科技商业/播客A.md', `---
date: 2024-01-01
category: 科技商业
---

内容`)

    // Entity files in each directory
    writeFile('人物/张三.md', '[[播客A]]')
    writeFile('项目/项目X.md', '[[播客A]]')
    writeFile('概念/概念Y.md', '[[播客A]]')
    writeFile('术语/术语Z.md', '[[播客A]]')

    const index = buildBacklinkIndex(tmpDir)

    const entityTypes = index.map(e => e.entityType).sort()
    expect(entityTypes).toEqual(['concepts', 'people', 'projects', 'terms'])
  })

  it('sorts entities by reference count descending', () => {
    // Two podcast notes
    writeFile('科技商业/播客A.md', `---
date: 2024-01-01
---
内容`)
    writeFile('科技商业/播客B.md', `---
date: 2024-06-01
---
内容`)

    // 张三 is linked by both, 李四 only by one
    writeFile('人物/张三.md', '[[播客A]]\n[[播客B]]')
    writeFile('人物/李四.md', '[[播客A]]')

    const index = buildBacklinkIndex(tmpDir)

    expect(index[0].entityName).toBe('张三')
    expect(index[0].podcastRefs.length).toBe(2)
    expect(index[1].entityName).toBe('李四')
    expect(index[1].podcastRefs.length).toBe(1)
  })

  it('deduplicates links within a single entity file', () => {
    writeFile('科技商业/播客A.md', `---
date: 2024-01-01
---
内容`)

    writeFile('人物/张三.md', '[[播客A]]\n[[播客A]]\n[[播客A]]')

    const index = buildBacklinkIndex(tmpDir)

    expect(index.length).toBe(1)
    expect(index[0].podcastRefs.length).toBe(1)
  })

  it('sorts podcastRefs by date descending', () => {
    writeFile('科技商业/旧播客.md', `---
date: 2020-01-01
---
内容`)
    writeFile('科技商业/新播客.md', `---
date: 2024-12-01
---
内容`)
    writeFile('科技商业/中播客.md', `---
date: 2022-06-15
---
内容`)

    writeFile('人物/张三.md', '[[旧播客]]\n[[新播客]]\n[[中播客]]')

    const index = buildBacklinkIndex(tmpDir)
    const dates = index[0].podcastRefs.map(r => r.date)

    expect(dates).toEqual(['2024-12-01', '2022-06-15', '2020-01-01'])
  })

  it('excludes entity files with no matching podcast links', () => {
    writeFile('科技商业/播客A.md', `---
date: 2024-01-01
---
内容`)

    writeFile('人物/张三.md', '[[播客A]]')
    writeFile('人物/无关人.md', '[[不存在的播客]]')

    const index = buildBacklinkIndex(tmpDir)

    expect(index.length).toBe(1)
    expect(index[0].entityName).toBe('张三')
  })

  it('handles empty entity directory gracefully', () => {
    // Only create the entity dir with no .md files
    fs.mkdirSync(path.join(tmpDir, '人物'), { recursive: true })

    const index = buildBacklinkIndex(tmpDir)
    expect(index).toEqual([])
  })

  it('returns empty when no entity directories exist', () => {
    writeFile('科技商业/播客A.md', `---
date: 2024-01-01
---
内容`)

    const index = buildBacklinkIndex(tmpDir)
    expect(index).toEqual([])
  })

  it('performs normalized fuzzy matching for wiki-links', () => {
    // Podcast file name has trailing dots
    writeFile('科技商业/播客标题....md', `---
date: 2024-01-01
---
内容`)

    // Entity links to it without trailing dots (3 dots vs 4)
    writeFile('人物/张三.md', '[[播客标题...]]')

    const index = buildBacklinkIndex(tmpDir)

    expect(index.length).toBe(1)
    expect(index[0].entityName).toBe('张三')
    expect(index[0].podcastRefs.length).toBe(1)
  })
})
