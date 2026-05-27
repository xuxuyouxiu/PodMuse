import test from 'node:test'
import assert from 'node:assert/strict'

const NON_NOTABLE_ROLE_PATTERNS = [
  /^自媒体$/,
  /^博主$/,
  /^UP主$/,
  /^网红$/,
  /^播客主持人$/,
  /^主持人$/,
  /^嘉宾$/,
  /^嘉宾\s*$/,
  /^普通/,
  /爱好者$/,
  /^主播$/,
  /^内容创作者$/,
]

const NON_NOTABLE_NAME_PATTERNS = [
  /妈妈$/,
  /爸爸$/,
  /君$/,
  /学长$/,
  /学姐$/,
  /老师$/,
]

function isNotablePerson(person) {
  const name = person.name || ''
  const role = (person.role || '').trim()

  if (!role) return false

  for (const pattern of NON_NOTABLE_ROLE_PATTERNS) {
    if (pattern.test(role)) return false
  }

  for (const pattern of NON_NOTABLE_NAME_PATTERNS) {
    if (pattern.test(name)) return false
  }

  return true
}

function filterNonNotablePeople(entities) {
  const filtered = entities.people.filter(isNotablePerson)
  const removed = entities.people.length - filtered.length
  if (removed > 0) {
    const removedNames = entities.people.filter(p => !isNotablePerson(p)).map(p => p.name).join(', ')
    console.log(`FILTERED: ${removedNames}`)
  }
  return { ...entities, people: filtered }
}

test('FILTER1: 知识妈妈应被过滤(名字结尾"妈妈")', () => {
  const entities = { people: [{ name: '知识妈妈', role: '知识博主' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0, '知识妈妈应被过滤')
})

test('FILTER2: 角色为"自媒体"应过滤', () => {
  const entities = { people: [{ name: '张三', role: '自媒体' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER3: 角色为"博主"应过滤', () => {
  const entities = { people: [{ name: '李四', role: '博主' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER4: 角色为"UP主"应过滤', () => {
  const entities = { people: [{ name: '王五', role: 'UP主' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER5: 角色为"播客主持人"应过滤', () => {
  const entities = { people: [{ name: '赵六', role: '播客主持人' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER6: 角色为"嘉宾"应过滤', () => {
  const entities = { people: [{ name: '孙七', role: '嘉宾' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER7: 名称为"xx君"应过滤', () => {
  const entities = { people: [{ name: '理财君', role: '财经领域从业者' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER8: 名称为"xx学长"应过滤', () => {
  const entities = { people: [{ name: '考研学长', role: '教育博主' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER9: 空角色应过滤', () => {
  const entities = { people: [{ name: '无名氏', role: '' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER10: 行业专家+真实姓名应保留', () => {
  const entities = { people: [
    { name: '张一鸣', role: '字节跳动创始人 / 企业家' },
    { name: '李飞飞', role: '斯坦福大学教授 / AI学者' },
    { name: '罗翔', role: '中国政法大学教授 / 法学学者' },
  ], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 3, '知名人物应全部保留')
})

test('FILTER11: 混合场景部分过滤', () => {
  const entities = { people: [
    { name: '埃隆·马斯克', role: 'Tesla CEO / 企业家' },
    { name: '知识妈妈', role: '知识博主' },
    { name: '纳瓦尔', role: 'AngelList创始人 / 投资人' },
    { name: '某UP主', role: 'UP主' },
  ], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 2, '应保留马斯克和纳瓦尔，过滤知识妈妈和某UP主')
  const names = result.people.map(p => p.name)
  assert.ok(names.includes('埃隆·马斯克'))
  assert.ok(names.includes('纳瓦尔'))
})

test('FILTER12: "普通人"角色应过滤', () => {
  const entities = { people: [{ name: '周八', role: '普通从业者' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER13: "爱好者"角色应过滤', () => {
  const entities = { people: [{ name: '吴九', role: '摄影爱好者' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER14: "内容创作者"应过滤', () => {
  const entities = { people: [{ name: '郑十', role: '内容创作者' }], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})

test('FILTER15: 英文名+明确职位应保留', () => {
  const entities = { people: [
    { name: 'Sam Altman', role: 'OpenAI CEO' },
    { name: 'Paul Graham', role: 'Y Combinator 创始人' },
  ], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 2)
})

test('FILTER16: 角色包含"创始人/CEO/教授/学者"等关键词应保留', () => {
  const entities = { people: [
    { name: '雷军', role: '小米科技创始人 / CEO' },
    { name: '吴军', role: '计算机科学家 / 作家' },
  ], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 2)
})

test('FILTER17: 空人物列表不报错', () => {
  const entities = { people: [], projects: [], concepts: [], terms: [] }
  const result = filterNonNotablePeople(entities)
  assert.equal(result.people.length, 0)
})
