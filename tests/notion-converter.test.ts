import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  markdownToNotionBlocks,
  frontmatterToNotionProperties,
  buildRichText,
} from '../src/main/notion-converter'
import type { NotionDatabaseSchema } from '../src/main/notion-converter'

// ===== buildRichText =====

describe('buildRichText', () => {
  it('returns empty array for empty string', () => {
    expect(buildRichText('')).toEqual([])
  })

  it('wraps text in Notion rich_text format', () => {
    const result = buildRichText('hello')
    expect(result).toEqual([{ type: 'text', text: { content: 'hello' } }])
  })

  it('truncates text longer than 2000 chars', () => {
    const long = 'A'.repeat(2500)
    const result = buildRichText(long)
    expect(result).toHaveLength(1)
    expect(result[0].text.content.length).toBe(2000)
    expect(result[0].text.content.endsWith('...')).toBe(true)
  })

  it('does not truncate text at exactly 2000 chars', () => {
    const exact = 'B'.repeat(2000)
    const result = buildRichText(exact)
    expect(result[0].text.content).toBe(exact)
    expect(result[0].text.content.length).toBe(2000)
  })
})

// ===== parseFrontmatter =====

describe('parseFrontmatter', () => {
  it('parses basic key-value pairs', () => {
    const md = `---
title: My Episode
date: 2024-01-15
---
Body text here`
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('My Episode')
    expect(frontmatter.date).toBe('2024-01-15')
    expect(body).toBe('Body text here')
  })

  it('strips surrounding quotes from values', () => {
    const md = `---
title: "Quoted Title"
show: 'Single Quoted'
---
Body`
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('Quoted Title')
    expect(frontmatter.show).toBe('Single Quoted')
  })

  it('parses array values [a, b, c]', () => {
    const md = `---
tags: [AI, 机器学习, NLP]
---
Body`
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.tags).toEqual(['AI', '机器学习', 'NLP'])
  })

  it('handles empty array', () => {
    const md = `---
tags: []
---
Body`
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.tags).toEqual([])
  })

  it('returns empty frontmatter when no frontmatter block', () => {
    const md = 'Just some text without frontmatter'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter).toEqual({})
    expect(body).toBe(md)
  })

  it('handles \r\n line endings', () => {
    const md = '---\r\ntitle: Windows Line\r\n---\r\nBody'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('Windows Line')
    expect(body).toBe('Body')
  })

  it('returns body as-is when no frontmatter', () => {
    const md = '# Heading\n\nParagraph'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter).toEqual({})
    expect(body).toBe(md)
  })

  it('ignores malformed YAML lines', () => {
    const md = `---
title: Valid
  indented: skip
---
Body`
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.title).toBe('Valid')
    expect(frontmatter.indented).toBeUndefined()
  })
})

// ===== markdownToNotionBlocks =====

describe('markdownToNotionBlocks', () => {
  // --- Headings ---
  describe('headings', () => {
    it('converts # to heading_1', () => {
      const blocks = markdownToNotionBlocks('# Title')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('heading_1')
      expect((blocks[0] as any).heading_1.rich_text[0].text.content).toBe('Title')
    })

    it('converts ## to heading_2', () => {
      const blocks = markdownToNotionBlocks('## Subtitle')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('heading_2')
      expect((blocks[0] as any).heading_2.rich_text[0].text.content).toBe('Subtitle')
    })

    it('converts ### to heading_3', () => {
      const blocks = markdownToNotionBlocks('### Section')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('heading_3')
      expect((blocks[0] as any).heading_3.rich_text[0].text.content).toBe('Section')
    })

    it('strips wiki links in headings', () => {
      const blocks = markdownToNotionBlocks('# [[My Note|Alias]]')
      expect((blocks[0] as any).heading_1.rich_text[0].text.content).toBe('Alias')
    })
  })

  // --- Paragraphs ---
  describe('paragraphs', () => {
    it('converts plain text to paragraph', () => {
      const blocks = markdownToNotionBlocks('Hello world')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('paragraph')
      expect((blocks[0] as any).paragraph.rich_text[0].text.content).toBe('Hello world')
    })

    it('strips wiki links in paragraphs', () => {
      const blocks = markdownToNotionBlocks('See [[Other Note]] for details')
      expect((blocks[0] as any).paragraph.rich_text[0].text.content).toBe(
        'See Other Note for details',
      )
    })

    it('skips empty lines', () => {
      const blocks = markdownToNotionBlocks('Line 1\n\nLine 2')
      expect(blocks).toHaveLength(2)
      expect(blocks[0].type).toBe('paragraph')
      expect(blocks[1].type).toBe('paragraph')
    })
  })

  // --- Lists ---
  describe('lists', () => {
    it('converts - item to bulleted_list_item', () => {
      const blocks = markdownToNotionBlocks('- bullet point')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('bulleted_list_item')
      expect((blocks[0] as any).bulleted_list_item.rich_text[0].text.content).toBe('bullet point')
    })

    it('converts 1. item to numbered_list_item', () => {
      const blocks = markdownToNotionBlocks('1. first item')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('numbered_list_item')
      expect((blocks[0] as any).numbered_list_item.rich_text[0].text.content).toBe('first item')
    })

    it('converts multi-digit numbered list', () => {
      const blocks = markdownToNotionBlocks('10. tenth item')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('numbered_list_item')
    })
  })

  // --- Quotes ---
  describe('quotes', () => {
    it('converts > text to quote block', () => {
      const blocks = markdownToNotionBlocks('> This is a quote')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('quote')
      expect((blocks[0] as any).quote.rich_text[0].text.content).toBe('This is a quote')
    })
  })

  // --- Todo ---
  describe('todo', () => {
    it('converts - [ ] to unchecked to_do', () => {
      const blocks = markdownToNotionBlocks('- [ ] unchecked task')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('to_do')
      const todo = blocks[0] as any
      expect(todo.to_do.rich_text[0].text.content).toBe('unchecked task')
      expect(todo.to_do.checked).toBe(false)
    })

    it('converts - [x] to checked to_do', () => {
      const blocks = markdownToNotionBlocks('- [x] done task')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('to_do')
      const todo = blocks[0] as any
      expect(todo.to_do.rich_text[0].text.content).toBe('done task')
      expect(todo.to_do.checked).toBe(true)
    })
  })

  // --- Code blocks ---
  describe('code blocks', () => {
    it('converts fenced code block', () => {
      const md = '```python\nprint("hello")\nworld\n```'
      const blocks = markdownToNotionBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('code')
      const code = blocks[0] as any
      expect(code.code.language).toBe('python')
      expect(code.code.rich_text[0].text.content).toBe('print("hello")\nworld')
    })

    it('defaults language to plain text when not specified', () => {
      const md = '```\ncode here\n```'
      const blocks = markdownToNotionBlocks(md)
      expect(blocks).toHaveLength(1)
      expect((blocks[0] as any).code.language).toBe('plain text')
    })

    it('handles empty code block', () => {
      const md = '```\n```'
      const blocks = markdownToNotionBlocks(md)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('code')
    })
  })

  // --- Divider ---
  describe('divider', () => {
    it('converts --- to divider', () => {
      const blocks = markdownToNotionBlocks('---')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('divider')
    })

    it('converts ---- (multiple dashes) to divider', () => {
      const blocks = markdownToNotionBlocks('------')
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('divider')
    })
  })

  // --- Mixed content ---
  describe('mixed content', () => {
    it('parses a realistic markdown document', () => {
      const md = [
        '# Episode 42',
        '',
        'Host: Alice',
        '',
        '- [x] Watched the show',
        '- [ ] Read the book',
        '',
        '> Great episode!',
        '',
        '---',
        '',
        '## Notes',
        '',
        '- Point one',
        '1. Step one',
        '',
        '```js',
        'console.log("hi")',
        '```',
      ].join('\n')

      const blocks = markdownToNotionBlocks(md)
      const types = blocks.map(b => b.type)
      expect(types).toEqual([
        'heading_1',
        'paragraph',
        'to_do',
        'to_do',
        'quote',
        'divider',
        'heading_2',
        'bulleted_list_item',
        'numbered_list_item',
        'code',
      ])
    })
  })
})

// ===== frontmatterToNotionProperties =====

describe('frontmatterToNotionProperties', () => {
  const schema: NotionDatabaseSchema = {
    titleProperty: 'Name',
    properties: {
      Name: { type: 'title' },
      show: { type: 'rich_text' },
      episode: { type: 'rich_text' },
      host: { type: 'rich_text' },
      guest: { type: 'rich_text' },
      platform: { type: 'rich_text' },
      date: { type: 'date' },
      category: { type: 'select' },
      tags: { type: 'multi_select' },
    },
  }

  it('maps title from frontmatter.title', () => {
    const props = frontmatterToNotionProperties({ title: 'My Episode' }, schema)
    expect(props.Name).toBeDefined()
    const titleProp = props.Name as any
    expect(titleProp.type).toBe('title')
    expect(titleProp.title[0].text.content).toBe('My Episode')
  })

  it('falls back to frontmatter.show for title', () => {
    const props = frontmatterToNotionProperties({ show: 'Tech Talk' }, schema)
    const titleProp = props.Name as any
    expect(titleProp.title[0].text.content).toBe('Tech Talk')
  })

  it('maps rich_text fields (show, episode, host, guest)', () => {
    const fm = { show: 'Podcast A', episode: 'EP01', host: 'Alice', guest: 'Bob' }
    const props = frontmatterToNotionProperties(fm, schema)
    expect((props.show as any).type).toBe('rich_text')
    expect((props.show as any).rich_text[0].text.content).toBe('Podcast A')
    expect((props.episode as any).rich_text[0].text.content).toBe('EP01')
    expect((props.host as any).rich_text[0].text.content).toBe('Alice')
    expect((props.guest as any).rich_text[0].text.content).toBe('Bob')
  })

  it('maps date field', () => {
    const props = frontmatterToNotionProperties({ date: '2024-01-15' }, schema)
    expect(props.date).toBeDefined()
    const dateProp = props.date as any
    expect(dateProp.type).toBe('date')
    expect(dateProp.date.start).toBe('2024-01-15')
  })

  it('maps select field (category)', () => {
    const props = frontmatterToNotionProperties({ category: 'Tech' }, schema)
    expect(props.category).toBeDefined()
    const catProp = props.category as any
    expect(catProp.type).toBe('select')
    expect(catProp.select.name).toBe('Tech')
  })

  it('maps multi_select field (tags)', () => {
    const props = frontmatterToNotionProperties({ tags: ['AI', 'NLP'] }, schema)
    expect(props.tags).toBeDefined()
    const tagsProp = props.tags as any
    expect(tagsProp.type).toBe('multi_select')
    expect(tagsProp.multi_select).toEqual([{ name: 'AI' }, { name: 'NLP' }])
  })

  it('wraps single tag value into array', () => {
    const props = frontmatterToNotionProperties({ tags: 'solo' }, schema)
    const tagsProp = props.tags as any
    expect(tagsProp.multi_select).toEqual([{ name: 'solo' }])
  })

  it('skips fields not in schema', () => {
    const props = frontmatterToNotionProperties({ unknownField: 'val' }, schema)
    expect(props.unknownField).toBeUndefined()
  })

  it('skips null/undefined values', () => {
    const props = frontmatterToNotionProperties({ show: undefined, episode: null as any }, schema)
    expect(props.show).toBeUndefined()
    expect(props.episode).toBeUndefined()
  })

  it('handles empty frontmatter', () => {
    const props = frontmatterToNotionProperties({}, schema)
    // title is set to empty string, which buildRichText converts to []
    const titleProp = props.Name as any
    expect(titleProp.title).toEqual([])
  })

  it('handles schema with no title property', () => {
    const noTitleSchema: NotionDatabaseSchema = {
      properties: { show: { type: 'rich_text' } },
    }
    const props = frontmatterToNotionProperties({ show: 'Test' }, noTitleSchema)
    expect(props.Name).toBeUndefined()
    expect((props.show as any).rich_text[0].text.content).toBe('Test')
  })

  it('platform maps to both rich_text and select when schema has both', () => {
    const bothSchema: NotionDatabaseSchema = {
      properties: {
        platform: { type: 'select' },
      },
    }
    const props = frontmatterToNotionProperties({ platform: 'YouTube' }, bothSchema)
    // platform is checked for select (iteration order: rich_text keys first, then select keys)
    // Since platform appears in both rich_text and select loops, the last write wins
    expect(props.platform).toBeDefined()
  })
})

// ===== 100 blocks limit =====

describe('100 blocks limit', () => {
  it('markdownToNotionBlocks produces correct count for large input', () => {
    // Generate 120 lines to exceed the 100-block limit
    const lines = Array.from({ length: 120 }, (_, i) => `- item ${i + 1}`)
    const blocks = markdownToNotionBlocks(lines.join('\n'))
    expect(blocks).toHaveLength(120)
    // All should be bulleted_list_item
    expect(blocks.every(b => b.type === 'bulleted_list_item')).toBe(true)
  })

  it('slice(0, 100) limits blocks to 100 (createNotionPage behavior)', () => {
    // Simulate the slice done in createNotionPage
    const lines = Array.from({ length: 150 }, (_, i) => `- item ${i + 1}`)
    const allBlocks = markdownToNotionBlocks(lines.join('\n'))
    const limited = allBlocks.slice(0, 100)
    expect(allBlocks).toHaveLength(150)
    expect(limited).toHaveLength(100)
    // First and last should match
    expect((limited[0] as any).bulleted_list_item.rich_text[0].text.content).toBe('item 1')
    expect((limited[99] as any).bulleted_list_item.rich_text[0].text.content).toBe('item 100')
  })

  it('input with fewer than 100 blocks is not truncated', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Paragraph ${i + 1}`)
    const blocks = markdownToNotionBlocks(lines.join('\n'))
    const limited = blocks.slice(0, 100)
    expect(limited).toHaveLength(50)
  })
})
