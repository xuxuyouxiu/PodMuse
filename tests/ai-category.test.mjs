import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function sanitizePathSegment(name) {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim()
  return cleaned || '未命名'
}

function parseCategoryFromMarkdown(md) {
  const clean = md.replace(/^\uFEFF/, '')
  const m = clean.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/m)
  if (!m) return null
  const fm = m[1]
  const catMatch = fm.match(/^category:\s*(.+)\s*$/m)
  if (!catMatch) return null
  const raw = catMatch[1].trim().replace(/^["']|["']$/g, '').trim()
  return raw || null
}

function listCategoryDirs(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
}

function folderSimilarity(folderName, aiCategory) {
  const a = folderName.toLowerCase()
  const b = aiCategory.toLowerCase()
  if (a === b) return 1.0
  if (a.includes(b) || b.includes(a)) return 0.9

  let overlap = 0
  const bSet = new Set(b.split(''))
  for (const ch of a) {
    if (bSet.has(ch)) overlap++
  }
  const charRatio = a.length > 0 ? overlap / Math.max(a.length, b.length) : 0

  const minLen = Math.min(a.length, b.length)
  let commonPrefix = 0
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) commonPrefix++
    else break
  }
  const prefixScore = minLen > 0 ? commonPrefix / minLen : 0

  return charRatio * 0.4 + prefixScore * 0.6
}

function resolveBestFolder(obsidianDir, aiCategory, log) {
  const existing = listCategoryDirs(obsidianDir)

  if (existing.length === 0) {
    if (log) log(`NEW: "${aiCategory}" → 无已有文件夹`)
    return sanitizePathSegment(aiCategory)
  }

  let bestMatch = ''
  let bestScore = 0
  for (const dir of existing) {
    const score = folderSimilarity(dir, aiCategory)
    if (score > bestScore) {
      bestScore = score
      bestMatch = dir
    }
  }

  if (bestScore >= 0.35 && bestMatch) {
    if (log) log(`MATCH: "${aiCategory}" → "${bestMatch}" (${bestScore.toFixed(2)})`)
    return bestMatch
  }

  if (log) log(`NEW: "${aiCategory}" → 最佳"${bestMatch}"=${bestScore.toFixed(2)}<0.35`)
  return sanitizePathSegment(aiCategory)
}

test('AI1: parseCategoryFromMarkdown 提取category字段', () => {
  const md = `---
type: podcast
show: 《高铁票为什么悄悄变贵了？》
date: 2024-01-15
tags: [高铁票价, 浮动票价]
category: 交通
---

# 正文
`
  assert.equal(parseCategoryFromMarkdown(md), '交通')
})

test('AI2: parseCategoryFromMarkdown 无category返回null', () => {
  const md = `---
type: podcast
tags: [AI, 科技]
---

# 正文
`
  assert.equal(parseCategoryFromMarkdown(md), null)
})

test('AI3: parseCategoryFromMarkdown category带空格', () => {
  const md = `---
category:   生活方式
---

# text
`
  assert.equal(parseCategoryFromMarkdown(md), '生活方式')
})

test('AI4: parseCategoryFromMarkdown category带引号', () => {
  const md = `---
category: "商业财经"
---

# text
`
  assert.equal(parseCategoryFromMarkdown(md), '商业财经')
})

test('AI5: folderSimilarity 完全相同=1.0', () => {
  assert.equal(folderSimilarity('科技', '科技'), 1.0)
  assert.equal(folderSimilarity('Technology', 'technology'), 1.0)
})

test('AI6: folderSimilarity 包含关系=0.9', () => {
  assert.equal(folderSimilarity('科技类', '科技'), 0.9)
  assert.equal(folderSimilarity('科技', '科技类'), 0.9)
  assert.equal(folderSimilarity('生活方式', '生活'), 0.9)
})

test('AI7: folderSimilarity 部分相似', () => {
  const s1 = folderSimilarity('科技类', '科普')
  const s2 = folderSimilarity('生活记录', '生活方式')
  console.log('科技类 vs 科普:', s1.toFixed(2))
  console.log('生活记录 vs 生活方式:', s2.toFixed(2))
  assert.ok(s1 < 0.9, '不完全包含不应给0.9')
  assert.ok(s2 > 0.3, '前缀相同应有较高分')
})

test('AI8: folderSimilarity 完全不相关', () => {
  const s = folderSimilarity('科技类', '美食')
  assert.ok(s < 0.3, `完全不相关相似度应<0.3，实际${s.toFixed(2)}`)
})

test('AI9: resolveBestFolder 匹配已有文件夹', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))
  fs.mkdirSync(path.join(tmpDir, '科技类'))
  fs.mkdirSync(path.join(tmpDir, '生活方式'))
  fs.mkdirSync(path.join(tmpDir, '其他'))

  try {
    const logs = []
    const r = resolveBestFolder(tmpDir, '科技', (m) => logs.push(m))
    console.log(logs.join('\n'))
    assert.equal(r, '科技类', `期望匹配"科技类"，实际"${r}"`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('AI10: resolveBestFolder 无匹配时新建', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))
  fs.mkdirSync(path.join(tmpDir, '科技类'))
  fs.mkdirSync(path.join(tmpDir, '商业'))

  try {
    const logs = []
    const r = resolveBestFolder(tmpDir, '美食', (m) => logs.push(m))
    console.log(logs.join('\n'))
    assert.equal(r, '美食', `无匹配时应返回AI原始分类，实际"${r}"`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('AI11: resolveBestFolder 空目录直接使用AI分类', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))

  try {
    const logs = []
    const r = resolveBestFolder(tmpDir, '交通', (m) => logs.push(m))
    console.log(logs.join('\n'))
    assert.equal(r, '交通')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('AI12: resolveBestFolder AI输出带类/记等同后缀仍能匹配', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))
  fs.mkdirSync(path.join(tmpDir, '职场成长类'))
  fs.mkdirSync(path.join(tmpDir, '历史社科类'))
  fs.mkdirSync(path.join(tmpDir, '文化艺术'))

  try {
    assert.equal(resolveBestFolder(tmpDir, '职场'), '职场成长类')
    assert.equal(resolveBestFolder(tmpDir, '历史'), '历史社科类')
    assert.equal(resolveBestFolder(tmpDir, '文化'), '文化艺术')
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('AI13: resolveBestFolder 相似度竞争选最佳', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))
  fs.mkdirSync(path.join(tmpDir, '生活记录'))
  fs.mkdirSync(path.join(tmpDir, '生活方式类'))

  try {
    const logs = []
    const r = resolveBestFolder(tmpDir, '生活', (m) => logs.push(m))
    console.log(logs.join('\n'))
    assert.ok(r === '生活记录' || r === '生活方式类', `应匹配"生活记录"或"生活方式类"，实际"${r}"`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

test('AI14: AI分类流程端到端模拟', () => {
  const md = `---
type: podcast
show: 《高铁票为什么悄悄变贵了？》
date: 2024-01-15
tags: [高铁票价, 浮动票价, 国铁集团, 京沪高铁, 债务]
category: 交通出行
---

# 正文
`
  const aiCategory = parseCategoryFromMarkdown(md)
  assert.equal(aiCategory, '交通出行')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-test-'))
  fs.mkdirSync(path.join(tmpDir, '科技类'))
  fs.mkdirSync(path.join(tmpDir, '生活方式'))

  try {
    const logs = []
    const folder = resolveBestFolder(tmpDir, aiCategory, (m) => logs.push(m))
    console.log('端到端:', logs.join('\n'))
    assert.equal(folder, '交通出行', `"交通出行"应新建文件夹，实际匹配"${folder}"`)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
