import { describe, it, expect, vi } from 'vitest'
import {
  FiresideAdapter,
  parseFiresidePage,
  decodeHtmlEntities,
} from '../src/main/platforms/fireside'
import { platformRegistry } from '../src/main/platforms'
import { pickEpisodeSource } from '../src/main/subscription-service'

// subscription-service 顶层 import 了 electron（app/BrowserWindow），node 测试环境无需真实对象
vi.mock('electron', () => ({
  app: { getPath: () => '' },
  BrowserWindow: class {},
}))

const adapter = new FiresideAdapter()

describe('FiresideAdapter.urlPattern / match', () => {
  it('matches episode page links with numeric id', () => {
    expect(adapter.match('https://guiguzaozhidao.fireside.fm/20240440')).toBe(true)
    expect(adapter.match('http://guiguzaozhidao.fireside.fm/20240440')).toBe(true)
    expect(adapter.match('https://fireside.fm/20240440')).toBe(true)
  })

  it('does not match feeds.fireside.fm RSS links', () => {
    expect(adapter.match('https://feeds.fireside.fm/guiguzaozhidao/rss')).toBe(false)
    expect(adapter.match('https://feeds.fireside.fm/20240440')).toBe(false)
  })

  it('does not match non-episode pages or other platforms', () => {
    expect(adapter.match('https://guiguzaozhidao.fireside.fm/episodes')).toBe(false)
    expect(adapter.match('https://example.com/123')).toBe(false)
    expect(adapter.match('https://www.xiaoyuzhoufm.com/episode/123')).toBe(false)
  })

  it('does not match suffix lookalike domains (notfireside.fm)', () => {
    expect(adapter.match('https://notfireside.fm/20240440')).toBe(false)
    expect(adapter.match('https://myfireside.fm/20240440')).toBe(false)
    expect(adapter.match('https://evil.com/fireside.fm/20240440')).toBe(false)
  })
})

describe('FiresideAdapter.getDedupKey', () => {
  it('uses host + pathname as episode key', () => {
    expect(adapter.getDedupKey('https://guiguzaozhidao.fireside.fm/20240440')).toBe(
      'guiguzaozhidao.fireside.fm/20240440',
    )
  })

  it('strips query string and trailing slash', () => {
    expect(adapter.getDedupKey('https://guiguzaozhidao.fireside.fm/20240440?t=1')).toBe(
      'guiguzaozhidao.fireside.fm/20240440',
    )
    expect(adapter.getDedupKey('https://guiguzaozhidao.fireside.fm/20240440/')).toBe(
      'guiguzaozhidao.fireside.fm/20240440',
    )
  })

  it('distinguishes the same numeric id across different shows', () => {
    expect(adapter.getDedupKey('https://show-a.fireside.fm/42')).not.toBe(
      adapter.getDedupKey('https://show-b.fireside.fm/42'),
    )
  })

  it('returns null for invalid URLs', () => {
    expect(adapter.getDedupKey('not a url')).toBeNull()
  })
})

describe('parseFiresidePage', () => {
  it('extracts og:title and og:audio:secure_url', () => {
    const html = [
      '<html><head>',
      '<meta property="og:title" content="【重听】朱雀三号副总师 | S9E41" />',
      '<meta property="og:audio:secure_url" content="https://aphid.fireside.fm/d/1/2/d9e11e3b.mp3" />',
      '</head></html>',
    ].join('\n')
    const parsed = parseFiresidePage(html)
    expect(parsed.title).toBe('【重听】朱雀三号副总师 | S9E41')
    expect(parsed.audioUrl).toBe('https://aphid.fireside.fm/d/1/2/d9e11e3b.mp3')
  })

  it('falls back to og:audio when secure_url is missing', () => {
    const html = '<meta property="og:audio" content="https://cdn.example.com/ep.mp3" />'
    expect(parseFiresidePage(html).audioUrl).toBe('https://cdn.example.com/ep.mp3')
  })

  it('falls back to JSON-LD associatedMedia.contentUrl', () => {
    const html = [
      '<script type="application/ld+json">',
      JSON.stringify({
        '@type': 'PodcastEpisode',
        url: 'https://guiguzaozhidao.fireside.fm/20240440',
        associatedMedia: {
          '@type': 'MediaObject',
          contentUrl: 'https://aphid.fireside.fm/d/9/x.mp3',
        },
      }),
      '</script>',
    ].join('\n')
    expect(parseFiresidePage(html).audioUrl).toBe('https://aphid.fireside.fm/d/9/x.mp3')
  })

  it('falls back to <audio src> tag', () => {
    const html =
      '<html><body><audio src="https://cdn.example.com/ep.mp3" controls></audio></body></html>'
    expect(parseFiresidePage(html).audioUrl).toBe('https://cdn.example.com/ep.mp3')
  })

  it('decodes HTML entities in meta content', () => {
    const html =
      '<meta property="og:title" content="A &amp; B 的对话 &#8211; S1" />' +
      '<meta property="og:audio:secure_url" content="https://cdn.example.com/a&amp;b.mp3" />'
    const parsed = parseFiresidePage(html)
    expect(parsed.title).toBe('A & B 的对话 – S1')
    expect(parsed.audioUrl).toBe('https://cdn.example.com/a&b.mp3')
  })

  it('handles meta attributes in reverse order', () => {
    const html = '<meta content="https://cdn.example.com/ep.mp3" property="og:audio:secure_url">'
    expect(parseFiresidePage(html).audioUrl).toBe('https://cdn.example.com/ep.mp3')
  })

  it('does not mistake data-content attribute for the real content', () => {
    const html =
      '<meta property="og:title" content="正确标题" data-content="干扰值" />' +
      '<meta property="og:audio:secure_url" content="https://cdn.example.com/real.mp3" data-content="干扰值" />'
    const parsed = parseFiresidePage(html)
    expect(parsed.title).toBe('正确标题')
    expect(parsed.audioUrl).toBe('https://cdn.example.com/real.mp3')
  })

  it('returns nulls when no audio meta is present', () => {
    const parsed = parseFiresidePage('<html><head><title>x</title></head></html>')
    expect(parsed.audioUrl).toBeNull()
    expect(parsed.title).toBeNull()
    expect(parseFiresidePage('').audioUrl).toBeNull()
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes basic and numeric entities', () => {
    expect(decodeHtmlEntities('A &amp; B &lt;x&gt; &quot;q&quot; &#39;s&#8211;')).toBe(
      'A & B <x> "q" \'s–',
    )
  })

  it('decodes hex entities and astral codepoints', () => {
    expect(decodeHtmlEntities('&#x1F680;&#x4e2d;')).toBe('🚀中')
    expect(decodeHtmlEntities('&#128640;')).toBe('🚀')
  })

  it('keeps invalid numeric entities as-is', () => {
    expect(decodeHtmlEntities('&#9999999999;')).toBe('&#9999999999;')
  })
})

describe('registry routing for fireside', () => {
  it('routes fireside episode pages to FiresideAdapter', () => {
    const info = platformRegistry.findAdapter('https://guiguzaozhidao.fireside.fm/20240440')
    expect(info?.id).toBe('fireside')
    expect(info?.name).toBe('Fireside')
  })

  it('still routes enclosure mp3 direct links to DirectUrlAdapter', () => {
    const info = platformRegistry.findAdapter(
      'https://aphid.fireside.fm/d/1437767933/4931937e/d9e11e3b.mp3',
    )
    expect(info?.id).toBe('direct_url')
  })

  it('returns null for feeds.fireside.fm RSS links', () => {
    expect(platformRegistry.findAdapter('https://feeds.fireside.fm/guiguzaozhidao/rss')).toBeNull()
  })
})

describe('pickEpisodeSource（订阅入队 source 选择）', () => {
  it('uses page link when a platform adapter matches it', () => {
    const ep = {
      link: 'https://guiguzaozhidao.fireside.fm/20240440',
      enclosureUrl: 'https://aphid.fireside.fm/d/9/x.mp3',
    }
    expect(pickEpisodeSource(ep)).toBe(ep.link)
  })

  it('falls back to enclosure direct media link when page link has no adapter', () => {
    const ep = {
      link: 'https://some-podcast-site.example/123',
      enclosureUrl: 'https://cdn.example.com/ep.mp3',
    }
    expect(pickEpisodeSource(ep)).toBe(ep.enclosureUrl)
  })

  it('keeps original link when neither link nor enclosure is recognizable', () => {
    const ep = {
      link: 'https://some-podcast-site.example/123',
      enclosureUrl: 'https://cdn.example.com/page',
    }
    expect(pickEpisodeSource(ep)).toBe(ep.link)
  })

  it('keeps original link when enclosure is empty', () => {
    const ep = { link: 'https://some-podcast-site.example/123', enclosureUrl: '' }
    expect(pickEpisodeSource(ep)).toBe(ep.link)
  })
})
