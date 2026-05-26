# 实体卡片自动生成（人物 / 项目 / 概念）设计文档

## 1. 目标

在播客笔记生成流程中，由 DeepSeek 一步提取笔记正文 + 实体卡片数据；后端解析实体数据，用对应模板生成独立 .md 文件存入 `人物/项目/概念` 三个文件夹；播客笔记与卡片笔记之间建立双向链接。

## 2. 架构与数据流

```
输入 URL → 5个处理步骤 → DeepSeek 一次调用 (generateNotes)
  → 返回两份内容：
      ① 播客笔记正文（现有模板，字段微调）
      ② 实体标记块（新增，---CARD-*--- 包裹）

后端解析实体块 parseEntityBlocks → 遍历每类实体
  ├─ 人物 → obsidian_dir/人物/姓名.md（用 People_Template.md）
  ├─ 项目 → obsidian_dir/项目/项目名.md（用 Project_Template.md）
  └─ 概念 → obsidian_dir/概念/概念名.md（用 Concept_Template.md）

双向链接：
  ├─ 播客笔记末尾插入“关联人物/项目/概念”章节
  └─ 卡片笔记“来源内容”字段追加 [[播客笔记文件名]]
```

## 3. AI Prompt 变更

在现有 `AI_PROMPT` 末尾，播客笔记模板 **之后**、**{transcript} 之前**，插入以下指令：

```text
另外，请检测本期播客中提到的所有重要实体，按以下格式输出。
注意：
- 如果某类实体没有提及，不要输出对应的 ---CARD-*--- 块
- 如果某类实体有多个，每段之间用空行隔开
- 字段值如果跨多行，保持缩进对齐
- 嘉宾已在 guest frontmatter 中列出，无需再输出人物卡片

---CARD-PEOPLE---
姓名：张三
角色：AI 创业者 / 学者 / 行业专家
核心观点：
  他认为AI时代最重要的能力是沟通能力。
  他不觉得中年人会被AI取代。
时间轴：12:30-18:45 讨论AI对工作影响

姓名：李四
角色：研究员
核心观点：
  他认为AI拉高了所有人的底线。
时间轴：40:00-45:20 讨论AI与教育
---CARD-PEOPLE-END---

---CARD-PROJECT---
项目名称：小宇宙
核心定位：中文播客平台
提及时间点：05:00-08:30, 22:10-25:00
相关链接：https://xiaoyuzhoufm.com
---CARD-PROJECT-END---

---CARD-CONCEPT---
概念名称：向量数据库
核心解释：一种能理解数据语义关系的数据库，而非仅靠关键词匹配
相关概念：[[传统数据库]], [[AI Agent]], [[RAG]]

概念名称：千人千面
核心解释：为每个用户提供个性化内容
相关概念：[[推荐系统]]
---CARD-CONCEPT-END---
```

## 4. 解析引擎

新增文件：`src/main/entity-cards.ts`

### 4.1 parseEntityBlocks

```typescript
interface PeopleEntity { name: string; role?: string; opinions?: string[]; timeline?: string }
interface ProjectEntity { name: string; summary?: string; timeline?: string; links?: string }
interface ConceptEntity { name: string; explanation?: string; related?: string[] }

interface EntityResult {
  people: PeopleEntity[]
  projects: ProjectEntity[]
  concepts: ConceptEntity[]
}

function parseEntityBlocks(markdown: string): EntityResult
```

解析规则：
- 用正则匹配 `---CARD-PEOPLE---\n([\s\S]*?)\n---CARD-PEOPLE-END---`
- 块内按 `字段名：值` 分割，`核心观点` 等多行值以缩进连续行收集
- 同一类内按 `姓名/项目名称/概念名称` 作为分段标记（出现时表示上一段结束、新段开始）

### 4.2 模板填充

从 `g:\Podcast_Notes\obsidian_templates\` 读取对应模板文件：
- `People_Template.md`
- `Project_Template.md`
- `Concept_Template.md`

填充逻辑：
- 替换 `name:` / `title:` 字段
- 播客笔记文件名填入 `source: [[文件名]]` / `提到他的内容来源` / `来源内容` 等对应位置
- 实体数据填入 `核心观点` 等章节
- 保留模板中其他手动填写占位符不变（如 `我的思考`）

打包后模板文件路径：`extraResources` 中带上 `obsidian_templates/` 目录，运行时通过 `process.resourcesPath` 定位。

### 4.3 写入与去重

```
writeEntityNotes(entities, obsidianDir, podcastFilename):
  for each people:
    path = obsidianDir/人物/sanitize(name).md
    if exists:
      if !contains(podcastFilename in source section):
        append "- [[podcastFilename]]"
    else:
      用 People_Template 填充 + 写新文件

  for each project:  同上逻辑
  for each concept:  同上逻辑
```

## 5. 播客笔记变更

在 `AI_PROMPT` 中，播客笔记模板末尾增加条件性章节（仅当有对应实体时输出）：

```markdown
---
# 关联人物
- [[张三]]
- [[李四]]

# 关联项目
- [[小宇宙]]

# 关联概念
- [[向量数据库]]
- [[千人千面]]
```

由 AI 根据实体检测结果自行决定是否输出这些章节。

## 6. 双向链接完整性

| 方向 | 实现 |
|---|---|
| 播客笔记 → 卡片 | 播客笔记末尾的 `关联XXX` 章节 |
| 卡片 → 播客笔记 | 卡片笔记 `来源内容` / `提到他的内容来源` 章节中追加 `[[播客文件名]]` |
| 已有卡片追加新来源 | 文件已存在时只追加来源行，不覆盖内容 |

## 7. 涉及文件

**新增：**
- `src/main/entity-cards.ts` — 解析引擎、模板填充、写入与去重

**修改：**
- `src/main/deepseek.ts` — AI_PROMPT 末尾插入实体块指令
- `src/main/podcast.ts` — 在 `generateNotes` 返回后，调用 `parseEntityBlocks` + `writeEntityNotes`；将播客笔记正文中 `关联XXX` 章节保留原样
- `electron-builder.yml` — extraResources 增加 `obsidian_templates/` 目录
- `tests/entity-cards.test.mjs` — 新测试文件

**不涉及：**
- UI / 设置页（纯后端逻辑）
- preload / IPC（不需前端触发）
- 分类配置文件（独立于卡片逻辑）

## 8. 测试验证

测试文件：`tests/entity-cards.test.mjs`

测试用例：

| # | 场景 | 断言 |
|---|---|---|
| 1 | 仅人物实体 | 只生成 `人物/` 目录文件，`项目/` `概念/` 空 |
| 2 | 仅项目实体 | 只生成 `项目/` |
| 3 | 人物+概念 | `人物/` 和 `概念/` 生成，`项目/` 空 |
| 4 | 无实体 | 三目录均无新文件 |
| 5 | 已存在人物卡片 | 第二次追加来源行，不覆盖内容 |
| 6 | 模板填充完整性 | 输出文件包含对应 frontmatter 和章节结构 |
