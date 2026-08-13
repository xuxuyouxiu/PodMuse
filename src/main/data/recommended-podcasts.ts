/**
 * 内置推荐播客清单（冷启动用）
 * feedUrl 均经 iTunes Search API 验证有效（2026-08-13）
 */
import type { RecommendedPodcast } from '../subscription-source'

export const recommendedPodcasts: RecommendedPodcast[] = [
  {
    name: "What's Next｜科技早知道",
    author: '声动活泼',
    feedUrl: 'https://feeds.fireside.fm/guiguzaozhidao/rss',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/f8/99/2a/f8992af8-b391-a6e9-72a2-dda4c223ace8/mza_3325716517235553759.jpg/600x600bb.jpg',
    description: '声动活泼出品，聊科技产业与商业动态',
  },
  {
    name: '声动早咖啡',
    author: '声动活泼',
    feedUrl: 'https://www.ximalaya.com/album/51076156.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts112/v4/a9/7f/7a/a97f7a8f-4451-05bc-bacc-637773b1b06a/mza_16067595309054880476.png/600x600bb.jpg',
    description: '每个工作日的科技商业晨间简报',
  },
  {
    name: '声东击西',
    author: 'ETW Studio',
    feedUrl: 'https://feeds.fireside.fm/shengdongjixi/rss',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/34/fe/fd/34fefd10-2039-380d-7015-dbc28b79f625/mza_7380566725793754773.jpg/600x600bb.jpg',
    description: '世界大事背后的商业与人文视角',
  },
  {
    name: '硅谷101',
    author: '硅谷101',
    feedUrl: 'https://feeds.fireside.fm/sv101/rss',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/96/d6/82/96d682e0-e42f-d8bf-68c3-c18ff9c20c8f/mza_15727650922171364471.jpg/600x600bb.jpg',
    description: '硅谷前线科技公司与创业者访谈',
  },
  {
    name: '商业就是这样',
    author: '商业就是这样',
    feedUrl: 'http://www.ximalaya.com/album/46587439.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/81/00/a1/8100a107-d5d0-025b-0467-ab14e5e84463/mza_8338424597865304845.jpeg/600x600bb.jpg',
    description: '用通俗方式解读商业世界',
  },
  {
    name: '疯投圈',
    author: '黄海、Rio',
    feedUrl: 'https://crazy.capital/feed',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/e8/d8/8e/e8d88ed9-b12c-b8d9-5e5d-25682f72c182/mza_4966428153200416701.png/600x600bb.jpg',
    description: '投资人视角聊消费、品牌与商业趋势',
  },
  {
    name: '故事FM',
    author: '寇爱哲',
    feedUrl: 'https://feeds.storyfm.cn/storyfm.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts116/v4/65/3c/2a/653c2a3c-e158-e0a7-3521-f44d7c281978/mza_2401098770430920951.png/600x600bb.jpg',
    description: '普通人讲述真实人生故事',
  },
  {
    name: '半拿铁 | 商业沉浮录',
    author: '潇磊&刘飞',
    feedUrl: 'https://proxy.wavpub.com/caffebreve.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts112/v4/95/33/4d/95334de1-1492-1ab0-aa7b-8f246bf89bde/mza_10728614257690800956.jpeg/600x600bb.jpg',
    description: '讲述品牌与商业背后的故事',
  },
  {
    name: '大内密谈',
    author: '大内密谈',
    feedUrl: 'http://rss.lizhi.fm/rss/14275.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts126/v4/2d/57/59/2d5759d5-a2e7-1eac-f692-6e7ab41caa2a/mza_12105036362162660893.jpg/600x600bb.jpg',
    description: '嬉笑怒骂聊文化、音乐与生活',
  },
  {
    name: '日谈公园',
    author: '日谈公园',
    feedUrl: 'http://www.ximalaya.com/album/5574153.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/7f/94/9e/7f949e9e-4b07-0e66-0321-733843fed63c/mza_2625935947068091835.jpg/600x600bb.jpg',
    description: '聊音乐、电影与青年文化',
  },
  {
    name: '文化有限',
    author: '文化有限',
    feedUrl: 'https://s1.proxy.wavpub.com/weknownothing.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/80/9d/72/809d724d-e1f2-bb68-3da7-cfb4f821ddf9/mza_869025148758774393.jpg/600x600bb.jpg',
    description: '三位朋友聊书聊文化',
  },
  {
    name: '乱翻书',
    author: '潘乱',
    feedUrl: 'https://feed.xyzfm.space/yxuruh3f9mc4',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts122/v4/ea/72/29/ea722999-7d8f-bec9-4cbf-a5eb055bdc53/mza_6606904668877953006.jpg/600x600bb.jpg',
    description: '聊互联网公司与商业变迁',
  },
  {
    name: '无人知晓',
    author: '孟岩',
    feedUrl: 'https://feed.xyzfm.space/ypn9dydpbxpc',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/99/76/95/99769525-5b7f-b1f4-3d11-b669ad4d0f71/mza_7503501950013528617.jpeg/600x600bb.jpg',
    description: '有知有行创始人孟岩聊投资与人生',
  },
  {
    name: '津津乐道',
    author: 'DAO',
    feedUrl: 'https://feeds.daopub.com/all.xml',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts114/v4/7a/30/c9/7a30c98c-a50e-9f0b-690c-30a749f834d3/mza_13763550855675413904.png/600x600bb.jpg',
    description: '聊科技、产品与开发者生活',
  },
]
