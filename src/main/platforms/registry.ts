/** 平台注册表：管理所有适配器，提供 URL → 适配器 路由 */

import type { PlatformAdapter, PlatformInfo } from './types'

class PlatformRegistry {
  private adapters: PlatformAdapter[] = []

  register(adapter: PlatformAdapter): void {
    this.adapters.push(adapter)
  }

  unregister(id: string): void {
    this.adapters = this.adapters.filter(a => a.id !== id)
  }

  /** 按注册顺序匹配第一个命中 URL 的适配器 */
  findAdapter(url: string): PlatformInfo | null {
    for (const adapter of this.adapters) {
      if (adapter.match(url)) {
        return { id: adapter.id, name: adapter.name, url, adapter }
      }
    }
    return null
  }

  getAll(): PlatformAdapter[] {
    return [...this.adapters]
  }

  getById(id: string): PlatformAdapter | undefined {
    return this.adapters.find(a => a.id === id)
  }
}

export const platformRegistry = new PlatformRegistry()

// === 注册所有平台适配器 ===
// 顺序很重要：具体平台在前，兜底适配器（direct_url）在最后

import { XiaoyuzhouAdapter } from './xiaoyuzhou'
import { BilibiliAdapter } from './bilibili'
import { YouTubeAdapter } from './youtube'
import { XimalayaAdapter } from './ximalaya'
import { ApplePodcastsAdapter } from './apple-podcasts'
import { DouyinAdapter } from './douyin'
import { DirectUrlAdapter } from './direct-url'

platformRegistry.register(new XiaoyuzhouAdapter())
platformRegistry.register(new BilibiliAdapter())
platformRegistry.register(new DouyinAdapter())
platformRegistry.register(new YouTubeAdapter())
platformRegistry.register(new XimalayaAdapter())
platformRegistry.register(new ApplePodcastsAdapter())
// DirectUrlAdapter 放在最后作为兜底（仅匹配有媒体扩展名的 URL）
platformRegistry.register(new DirectUrlAdapter())
