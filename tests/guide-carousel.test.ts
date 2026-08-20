import { describe, it, expect } from 'vitest'
import {
  GUIDE_MANIFESTS,
  resolveGuide,
  resolveSteps,
  toAssetSrc,
} from '../src/renderer/data/onboarding-manifest'

/**
 * 图文说明书 manifest 纯数据层测试。
 * 组件层（GuideCarousel.tsx）依赖 React DOM / electronAPI，项目未装 @testing-library/react
 * 且 vitest 环境为 node，故这里只测 manifest 数据与可导出的纯函数。
 */

const EXPECTED_KEYS = ['ai-key', 'feishu', 'douyin', 'notion', 'whisper', 'dirs']

describe('onboarding manifest 完整性', () => {
  it('包含 6 组指南，key 与预期一致且无重复', () => {
    expect(GUIDE_MANIFESTS).toHaveLength(6)
    const keys = GUIDE_MANIFESTS.map(g => g.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('每组 title 非空、steps 非空、每步 caption 非空且不过长（≤3 行）', () => {
    for (const guide of GUIDE_MANIFESTS) {
      expect(guide.title.trim(), guide.key + ' title 非空').not.toBe('')
      expect(guide.steps.length, guide.key + ' steps 非空').toBeGreaterThan(0)
      guide.steps.forEach((step, i) => {
        const label = guide.key + ' 第 ' + (i + 1) + ' 步'
        expect(step.caption.trim(), label + ' caption 非空').not.toBe('')
        expect(step.caption.length, label + ' caption ≤120 字（≤3 行）').toBeLessThanOrEqual(120)
      })
    }
  })

  it('每组 title/每步 caption 均提供英文（titleEn / captionEn 非空，en 语言下展示）', () => {
    for (const guide of GUIDE_MANIFESTS) {
      expect(guide.titleEn?.trim(), guide.key + ' titleEn 非空').not.toBe('')
      guide.steps.forEach((step, i) => {
        const label = guide.key + ' 第 ' + (i + 1) + ' 步'
        expect(step.captionEn?.trim(), label + ' captionEn 非空').not.toBe('')
      })
    }
  })

  it('image 若存在，路径以 public/onboarding/<key>/ 开头且为 .png', () => {
    for (const guide of GUIDE_MANIFESTS) {
      guide.steps.forEach((step, i) => {
        if (!step.image) return
        const label = guide.key + ' 第 ' + (i + 1) + ' 步图片路径'
        expect(step.image, label).toMatch(new RegExp('^public/onboarding/' + guide.key + '/'))
        expect(step.image, label + ' 以 .png 结尾').toMatch(/\.png$/)
      })
    }
  })

  it('actionUrl 若存在必须是 https 外链', () => {
    for (const guide of GUIDE_MANIFESTS) {
      if (guide.actionUrl) {
        expect(guide.actionUrl, guide.key + ' actionUrl 为 https').toMatch(/^https:\/\//)
      }
    }
  })

  it('各指南步骤数与方案一致（ai-key 3 / feishu 4 / douyin 2 / notion 3 / whisper 1 / dirs 1）', () => {
    const counts: Record<string, number> = {}
    for (const g of GUIDE_MANIFESTS) counts[g.key] = g.steps.length
    expect(counts).toEqual({
      'ai-key': 3,
      feishu: 4,
      douyin: 2,
      notion: 3,
      whisper: 1,
      dirs: 1,
    })
  })
})

describe('resolveSteps / resolveGuide / toAssetSrc 纯函数', () => {
  it('resolveGuide 按 key 返回指南', () => {
    const guide = resolveGuide('ai-key')
    expect(guide).not.toBeNull()
    expect(guide!.title.trim()).not.toBe('')
    expect(guide!.steps).toHaveLength(3)
    expect(guide!.actionUrl).toBe('https://platform.deepseek.com/api_keys')
    expect(resolveGuide('feishu')!.actionUrl).toBe('https://open.feishu.cn/app')
    expect(resolveGuide('notion')!.actionUrl).toBe('https://www.notion.so/my-integrations')
  })

  it('resolveGuide 未知 key 返回 null', () => {
    expect(resolveGuide('unknown-key')).toBeNull()
  })

  it('resolveSteps(manifest, key) 返回步骤数组；未知 key 返回 null', () => {
    expect(resolveSteps(GUIDE_MANIFESTS, 'ai-key')).toHaveLength(3)
    expect(resolveSteps(GUIDE_MANIFESTS, 'feishu')).toHaveLength(4)
    expect(resolveSteps(GUIDE_MANIFESTS, 'douyin')).toHaveLength(2)
    expect(resolveSteps(GUIDE_MANIFESTS, 'notion')).toHaveLength(3)
    expect(resolveSteps(GUIDE_MANIFESTS, 'whisper')).toHaveLength(1)
    expect(resolveSteps(GUIDE_MANIFESTS, 'dirs')).toHaveLength(1)
    expect(resolveSteps(GUIDE_MANIFESTS, 'unknown-key')).toBeNull()
  })

  it('toAssetSrc 去掉 public/ 前缀，供渲染层按根相对路径引用', () => {
    expect(toAssetSrc('public/onboarding/ai-key/1.png')).toBe('onboarding/ai-key/1.png')
    expect(toAssetSrc('onboarding/ai-key/1.png')).toBe('onboarding/ai-key/1.png')
  })
})
