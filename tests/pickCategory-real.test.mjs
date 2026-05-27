import test from 'node:test'
import assert from 'node:assert/strict'

const DEFAULT_CATEGORIES = [
  { id: 'tech', name: '科技类', priority: 100 },
  { id: 'business', name: '商业财经类', priority: 90 },
  { id: 'culture', name: '文化艺术类', priority: 80 },
  { id: 'history', name: '历史社科类', priority: 70 },
  { id: 'career', name: '职场成长类', priority: 60 },
  { id: 'life', name: '生活方式类', priority: 50 },
  { id: 'science', name: '学术科普类', priority: 40 },
  { id: 'other', name: '其他', priority: 0 },
]

const DEFAULT_RULES = [
  { match: 'AI', categoryId: 'tech', weight: 3 },
  { match: '人工智能', categoryId: 'tech', weight: 3 },
  { match: '科技', categoryId: 'tech', weight: 2 },
  { match: '技术', categoryId: 'tech', weight: 2 },
  { match: '编程', categoryId: 'tech', weight: 2 },
  { match: '软件', categoryId: 'tech', weight: 2 },
  { match: '硬件', categoryId: 'tech', weight: 2 },
  { match: '互联网', categoryId: 'tech', weight: 2 },
  { match: '算法', categoryId: 'tech', weight: 2 },
  { match: '机器学习', categoryId: 'tech', weight: 3 },
  { match: '深度学习', categoryId: 'tech', weight: 3 },
  { match: '区块链', categoryId: 'tech', weight: 2 },
  { match: '芯片', categoryId: 'tech', weight: 2 },
  { match: '自动驾驶', categoryId: 'tech', weight: 2 },
  { match: '大模型', categoryId: 'tech', weight: 3 },
  { match: 'LLM', categoryId: 'tech', weight: 3 },
  { match: '机器人', categoryId: 'tech', weight: 2 },
  { match: '数字化', categoryId: 'tech', weight: 2 },
  { match: '开源', categoryId: 'tech', weight: 2 },
  { match: '商业', categoryId: 'business', weight: 2 },
  { match: '创业', categoryId: 'business', weight: 3 },
  { match: '投资', categoryId: 'business', weight: 3 },
  { match: '金融', categoryId: 'business', weight: 3 },
  { match: '经济', categoryId: 'business', weight: 2 },
  { match: '市场', categoryId: 'business', weight: 2 },
  { match: '营销', categoryId: 'business', weight: 2 },
  { match: '管理', categoryId: 'business', weight: 1 },
  { match: '商业模式', categoryId: 'business', weight: 3 },
  { match: '财经', categoryId: 'business', weight: 2 },
  { match: '股票', categoryId: 'business', weight: 2 },
  { match: '基金', categoryId: 'business', weight: 2 },
  { match: 'VC', categoryId: 'business', weight: 2 },
  { match: 'PE', categoryId: 'business', weight: 2 },
  { match: 'IPO', categoryId: 'business', weight: 2 },
  { match: '艺术', categoryId: 'culture', weight: 2 },
  { match: '文化', categoryId: 'culture', weight: 1 },
  { match: '音乐', categoryId: 'culture', weight: 2 },
  { match: '电影', categoryId: 'culture', weight: 2 },
  { match: '文学', categoryId: 'culture', weight: 2 },
  { match: '设计', categoryId: 'culture', weight: 2 },
  { match: '摄影', categoryId: 'culture', weight: 2 },
  { match: '哲学', categoryId: 'culture', weight: 2 },
  { match: '游戏', categoryId: 'culture', weight: 1 },
  { match: '动漫', categoryId: 'culture', weight: 1 },
  { match: '历史', categoryId: 'history', weight: 3 },
  { match: '社会', categoryId: 'history', weight: 2 },
  { match: '政治', categoryId: 'history', weight: 2 },
  { match: '心理学', categoryId: 'history', weight: 2 },
  { match: '社会学', categoryId: 'history', weight: 2 },
  { match: '人类学', categoryId: 'history', weight: 2 },
  { match: '法律', categoryId: 'history', weight: 1 },
  { match: '国际关系', categoryId: 'history', weight: 2 },
  { match: '职场', categoryId: 'career', weight: 3 },
  { match: '成长', categoryId: 'career', weight: 1 },
  { match: '职业', categoryId: 'career', weight: 2 },
  { match: '教育', categoryId: 'career', weight: 2 },
  { match: '学习', categoryId: 'career', weight: 1 },
  { match: '效率', categoryId: 'career', weight: 2 },
  { match: '个人发展', categoryId: 'career', weight: 2 },
  { match: '领导力', categoryId: 'career', weight: 2 },
  { match: '沟通', categoryId: 'career', weight: 1 },
  { match: '面试', categoryId: 'career', weight: 2 },
  { match: '生活', categoryId: 'life', weight: 3 },
  { match: '健康', categoryId: 'life', weight: 2 },
  { match: '运动', categoryId: 'life', weight: 2 },
  { match: '旅行', categoryId: 'life', weight: 2 },
  { match: '美食', categoryId: 'life', weight: 2 },
  { match: '家庭', categoryId: 'life', weight: 2 },
  { match: '健身', categoryId: 'life', weight: 2 },
  { match: '科学', categoryId: 'science', weight: 3 },
  { match: '科普', categoryId: 'science', weight: 2 },
  { match: '研究', categoryId: 'science', weight: 1 },
  { match: '物理', categoryId: 'science', weight: 2 },
  { match: '生物', categoryId: 'science', weight: 2 },
  { match: '化学', categoryId: 'science', weight: 2 },
  { match: '医学', categoryId: 'science', weight: 2 },
  { match: '天文', categoryId: 'science', weight: 2 },
  { match: '地理', categoryId: 'science', weight: 2 },
  { match: '播客', categoryId: 'culture', weight: 1 },
  { match: '高铁', categoryId: 'life', weight: 2 },
  { match: '火车', categoryId: 'life', weight: 2 },
  { match: '铁路', categoryId: 'life', weight: 2 },
  { match: '出行', categoryId: 'life', weight: 2 },
  { match: '交通', categoryId: 'life', weight: 2 },
  { match: '旅游', categoryId: 'life', weight: 2 },
  { match: '票价', categoryId: 'life', weight: 2 },
  { match: '国铁', categoryId: 'life', weight: 2 },
  { match: '京沪', categoryId: 'life', weight: 2 },
  { match: '动车', categoryId: 'life', weight: 2 },
  { match: '客运', categoryId: 'life', weight: 2 },
  { match: '通勤', categoryId: 'life', weight: 2 },
  { match: '消费', categoryId: 'life', weight: 2 },
  { match: '购物', categoryId: 'life', weight: 2 },
  { match: '时尚', categoryId: 'life', weight: 2 },
  { match: '债务', categoryId: 'business', weight: 1 },
  { match: '国企', categoryId: 'business', weight: 1 },
  { match: '税务', categoryId: 'business', weight: 2 },
  { match: '银行', categoryId: 'business', weight: 2 },
  { match: '保险', categoryId: 'business', weight: 2 },
]

const KEYWORD_CATEGORY_MAP = [
  { keywords: ['科技', '技术', 'AI', '人工智能', '算法', '编程', '软件', '硬件', '互联网', '数据', '芯片', '机器人', '模型', '代码', '开源', '数字化', '服务器', '云', '网络'], categoryId: 'tech' },
  { keywords: ['商业', '创业', '投资', '金融', '经济', '市场', '营销', '管理', '财经', '股票', '基金', '融资', '上市', '盈利', '债务', '税务', '银行', '保险', '贸易'], categoryId: 'business' },
  { keywords: ['艺术', '文化', '音乐', '电影', '文学', '设计', '摄影', '哲学', '游戏', '动漫', '绘画', '戏剧', '舞蹈', '创作', '节目', '播客'], categoryId: 'culture' },
  { keywords: ['历史', '社会', '政治', '心理学', '社会学', '人类学', '法律', '战争', '文明', '制度', '国际关系', '考古', '朝代', '古代'], categoryId: 'history' },
  { keywords: ['职场', '职业', '教育', '学习', '效率', '领导力', '沟通', '面试', '简历', '升职', '转行', '培训', '成长', '目标', '时间管理', '规划'], categoryId: 'career' },
  { keywords: ['生活', '健康', '运动', '旅行', '美食', '家庭', '健身', '育儿', '宠物', '园艺', '家居', '情感', '高铁', '铁路', '出行', '交通', '旅游', '票价', '火车', '国铁', '京沪', '动车', '客运', '通勤', '地铁', '公交', '自驾', '消费', '购物', '时尚', '穿搭', '美妆', '咖啡', '茶'], categoryId: 'life' },
  { keywords: ['科学', '科普', '物理', '生物', '化学', '医学', '天文', '地理', '数学', '实验', '研究', '发现', '理论', '实验室', '论文', '学者'], categoryId: 'science' },
]

function keywordFuzzyMatch(tag) {
  for (const entry of KEYWORD_CATEGORY_MAP) {
    for (const kw of entry.keywords) {
      if (tag.includes(kw)) return entry.categoryId
    }
  }
  return null
}

function pickCategoryName(tags, cfg, log) {
  const byId = new Map(cfg.categories.map(c => [c.id, c]))
  const score = new Map()
  const scoreDetail = new Map()
  for (const c of cfg.categories) { score.set(c.id, 0); scoreDetail.set(c.id, []) }

  for (const tag of tags) {
    let tagMatched = false

    for (const rule of cfg.rules) {
      if (!byId.has(rule.categoryId)) continue
      if (rule.match === tag) {
        score.set(rule.categoryId, (score.get(rule.categoryId) || 0) + rule.weight)
        scoreDetail.get(rule.categoryId).push(`  ✓ exact: "${tag}" → +${rule.weight}`)
        tagMatched = true
      } else if (tag.includes(rule.match) && rule.match.length >= 2) {
        const subWeight = Math.max(1, rule.weight - 1)
        score.set(rule.categoryId, (score.get(rule.categoryId) || 0) + subWeight)
        scoreDetail.get(rule.categoryId).push(`  ~ substr: "${tag}" includes "${rule.match}" → +${subWeight}`)
        tagMatched = true
      }
    }

    const fuzzyId = keywordFuzzyMatch(tag)
    if (fuzzyId && byId.has(fuzzyId)) {
      score.set(fuzzyId, (score.get(fuzzyId) || 0) + 2)
      scoreDetail.get(fuzzyId).push(`  ≈ fuzzy: "${tag}" → +2`)
      tagMatched = true
    }

    if (!tagMatched) {
      if (log) log(`  ⚠ NO MATCH: "${tag}"`)
    }
  }

  const other = cfg.categories.find(c => c.id === 'other')?.name || '其他'
  let bestId = null
  let bestScore = 0
  let bestPriority = -Infinity
  for (const c of cfg.categories) {
    const s = score.get(c.id) || 0
    if (s <= 0) continue
    if (s > bestScore || (s === bestScore && c.priority > bestPriority)) {
      bestId = c.id
      bestScore = s
      bestPriority = c.priority
    }
  }
  if (bestId) {
    const name = byId.get(bestId).name
    const details = scoreDetail.get(bestId) || []
    if (log) {
      log(`MATCH: ${name} (score=${bestScore})`)
      for (const d of details) log(d)
    }
    return name
  }
  if (log) log(`NO MATCH -> ${other}`)
  return other
}

function parseTagsFromMarkdown(md) {
  const clean = md.replace(/^\uFEFF/, '')
  const m = clean.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/m)
  if (!m) return []
  const fm = m[1]
  const inline = fm.match(/^tags:\s*\[(.*)\]\s*$/m)
  if (inline) {
    return inline[1]
      .split(/[,，]/)
      .map(s => s.trim().replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
  }
  const lines = fm.split(/\r?\n/)
  let inList = false
  const tags = []
  for (const line of lines) {
    if (!inList) {
      if (/^tags:\s*$/.test(line)) { inList = true; continue }
    } else {
      const li = line.match(/^\s*-\s*(.+)\s*$/)
      if (li) {
        tags.push(li[1].trim().replace(/^["']|["']$/g, '').trim())
      } else if (/^\S/.test(line)) break
    }
  }
  return tags
}

const cfg = { version: 1, categories: DEFAULT_CATEGORIES, rules: [...DEFAULT_RULES] }

test('P1: 高铁票价完整标签集→生活方式类 (WITH子串匹配)', () => {
  const tags = ['高铁票价', '浮动票价', '国铁集团', '京沪高铁', '债务']
  const logs = []
  const result = pickCategoryName(tags, cfg, (m) => logs.push(m))

  console.log('=== P1 分类详情 ===')
  for (const l of logs) console.log(l)

  assert.equal(result, '生活方式类', `期望"生活方式类"，实际"${result}"`)
  assert.ok(result !== '其他', '不应归类到"其他"')
})

test('P2: 子串匹配验证 - "高铁票价"包含"高铁"和"票价"', () => {
  const tagsOnly = ['高铁票价']
  const logs = []
  const result = pickCategoryName(tagsOnly, cfg, (m) => logs.push(m))

  console.log('=== P2 详情 ===')
  for (const l of logs) console.log(l)

  assert.equal(result, '生活方式类')
})

test('P3: "国铁集团"可通过"国铁"关键词匹配', () => {
  const tagsOnly = ['国铁集团']
  const logs = []
  const result = pickCategoryName(tagsOnly, cfg, (m) => logs.push(m))

  console.log('=== P3 详情 ===')
  for (const l of logs) console.log(l)

  assert.equal(result, '生活方式类', `"国铁集团"应匹配"国铁"→生活方式类，实际"${result}"`)
})

test('P4: "京沪高铁"可多重匹配(京沪+高铁)', () => {
  const tagsOnly = ['京沪高铁']
  const logs = []
  const result = pickCategoryName(tagsOnly, cfg, (m) => logs.push(m))

  console.log('=== P4 详情 ===')
  for (const l of logs) console.log(l)

  assert.equal(result, '生活方式类')
})

test('P5: 全品类基准测试', () => {
  const cases = [
    { tags: ['AI', '编程'], expected: '科技类' },
    { tags: ['投资', '金融'], expected: '商业财经类' },
    { tags: ['音乐', '电影'], expected: '文化艺术类' },
    { tags: ['历史', '社会'], expected: '历史社科类' },
    { tags: ['职场', '面试'], expected: '职场成长类' },
    { tags: ['高铁', '出行'], expected: '生活方式类' },
    { tags: ['科学', '物理'], expected: '学术科普类' },
    { tags: [], expected: '其他' },
    { tags: ['未知标签XYZ'], expected: '其他' },
  ]
  for (const tc of cases) {
    const r = pickCategoryName(tc.tags, cfg)
    assert.equal(r, tc.expected, `[${tc.tags}] → "${tc.expected}" ≠ "${r}"`)
  }
})

test('P6: 复合标签子串匹配全覆盖', () => {
  const cases = [
    { tags: ['高铁票价'], expected: '生活方式类' },
    { tags: ['京沪高铁'], expected: '生活方式类' },
    { tags: ['浮动票价'], expected: '生活方式类' },
    { tags: ['国铁集团'], expected: '生活方式类' },
    { tags: ['动车组'], expected: '生活方式类' },
    { tags: ['通勤时间'], expected: '生活方式类' },
    { tags: ['消费升级'], expected: '生活方式类' },
    { tags: ['深度学习方法'], expected: '职场成长类' },
    { tags: ['商业分析'], expected: '商业财经类' },
    { tags: ['历史文化'], expected: '文化艺术类' },
    { tags: ['职业规划'], expected: '职场成长类' },
    { tags: ['科学研究'], expected: '学术科普类' },
  ]
  for (const tc of cases) {
    const r = pickCategoryName(tc.tags, cfg)
    assert.equal(r, tc.expected, `[${tc.tags}] → "${tc.expected}" ≠ "${r}"`)
  }
})

test('P7: 混合标签正确加权(生活>商业)', () => {
  const tags = ['高铁票价', '债务']
  const logs = []
  const result = pickCategoryName(tags, cfg, (m) => logs.push(m))
  console.log('=== P7 详情 ===')
  for (const l of logs) console.log(l)
  assert.equal(result, '生活方式类', '高铁+票价权重应超过债务的权重')
})

test('P8: parseTagsFromMarkdown 去除引号', () => {
  const md = `---
tags: ["高铁票价", "浮动票价", "国铁集团"]
---

# text
`
  const tags = parseTagsFromMarkdown(md)
  assert.deepEqual(tags, ['高铁票价', '浮动票价', '国铁集团'])
})

test('P9: parseTagsFromMarkdown 处理混合引号格式', () => {
  const md = `---
tags: ['高铁票价', "京沪高铁", 债务]
---

# text
`
  const tags = parseTagsFromMarkdown(md)
  assert.deepEqual(tags, ['高铁票价', '京沪高铁', '债务'])
})

test('P10: parseTagsFromMarkdown 正常无引号格式', () => {
  const md = `---
type: podcast
tags: [高铁票价, 浮动票价, 国铁集团, 京沪高铁, 债务]
---

# 正文
`
  const tags = parseTagsFromMarkdown(md)
  assert.deepEqual(tags, ['高铁票价', '浮动票价', '国铁集团', '京沪高铁', '债务'])
})

test('P11: parseTagsFromMarkdown 列表格式带引号', () => {
  const md = `---
tags:
  - "高铁票价"
  - '浮动票价'
  - 债务
---

# text
`
  const tags = parseTagsFromMarkdown(md)
  assert.deepEqual(tags, ['高铁票价', '浮动票价', '债务'])
})

test('P12: parseTagsFromMarkdown CRLF分隔', () => {
  const md = "---\r\ntype: podcast\r\ntags: [高铁票价, 浮动票价]\r\n---\r\n\r\n# text\r\n"
  const tags = parseTagsFromMarkdown(md)
  assert.deepEqual(tags, ['高铁票价', '浮动票价'])
})

test('P13: loadOrInitCategoryConfig 合并缺失规则', () => {
  const matching = new Set(DEFAULT_RULES.map(r => r.match))
  assert.ok(matching.has('高铁'), 'DEFAULT_RULES应包含"高铁"')
  assert.ok(matching.has('国铁'), 'DEFAULT_RULES应包含"国铁"')
  assert.ok(matching.has('京沪'), 'DEFAULT_RULES应包含"京沪"')
  assert.ok(matching.has('票价'), 'DEFAULT_RULES应包含"票价"')
  assert.ok(matching.has('债务'), 'DEFAULT_RULES应包含"债务"')
  assert.ok(matching.has('通勤'), 'DEFAULT_RULES应包含"通勤"')
})

test('P14: 仅有债务标签不应覆盖生活类', () => {
  const tags = ['高铁票价', '债务']
  const result = pickCategoryName(tags, cfg)
  assert.equal(result, '生活方式类', '高铁+票价的权重应超越债务')
})

test('P15: 纯商业标签→商业财经类', () => {
  assert.equal(pickCategoryName(['债务', '国企', '金融'], cfg), '商业财经类')
})

test('P16: 无匹配标签→其他', () => {
  assert.equal(pickCategoryName(['xyzabc', 'no-match-here'], cfg), '其他')
})
