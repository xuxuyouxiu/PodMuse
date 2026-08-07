/** 轻量级 i18n：语言切换（中文 / English） */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Language = 'zh' | 'en'

// ── 翻译字典 ──
const dict = {
  zh: {
    // 通用
    'app.name': '播客笔记助手',
    'app.subtitle': '小宇宙链接自动下载、AI 提炼、写入 Obsidian',
    // 顶栏
    'header.processing': '处理中',
    'header.idle': '空闲',
    'header.lang': 'Language',
    'header.searchPlaceholder': '搜索笔记、播客、关键词...',
    'header.searching': '搜索中...',
    'header.noResults': '未找到匹配结果',
    'header.clear': '清除搜索',
    'header.light': '浅色',
    'header.dark': '深色',
    'header.minimize': '最小化',
    'header.maximize': '最大化',
    'header.close': '关闭',
    // 侧边栏
    'sidebar.notes': '笔记',
    'sidebar.search': '搜索',
    'sidebar.backlinks': '知识关联',
    'sidebar.batch': '批量队列',
    'sidebar.settings': '设置',
    'sidebar.about': '关于',
    'sidebar.version': '版本',
    'sidebar.stats.title': '任务概览',
    'sidebar.stats.running': '进行中',
    'sidebar.stats.queued': '排队中',
    'sidebar.stats.done': '今日完成',
    // 输入框
    'url.eyebrow': '开始新任务',
    'url.title': '粘贴链接开始处理',
    'url.placeholder': '粘贴小宇宙 / B站 / YouTube / 抖音等链接…',
    'url.process': '开始处理',
    'url.batch': '批量粘贴',
    'url.unsupported': '暂不支持该平台，请使用本地文件方式',
    'url.pasteHint': '支持粘贴小宇宙、B站、YouTube、抖音、喜马拉雅、Apple Podcasts 链接',
    // 步骤面板
    'steps.idle.title': '等待处理任务',
    'steps.idle.subtitle': '输入小宇宙链接或等待飞书消息',
    'steps.idle.step1': '粘贴播客链接',
    'steps.idle.step2': '自动转写并生成笔记',
    'steps.idle.step3': '结果推送至飞书群',
    // 任务
    'tasks.active': '处理中',
    'tasks.recent': '最近任务',
    'tasks.empty': '暂无任务',
    'tasks.cancel': '取消',
    'tasks.retry': '重试',
    'tasks.remove': '移除',
    'tasks.status.done': '完成',
    'tasks.status.running': '进行中',
    'tasks.status.error': '失败',
    'tasks.status.pending': '等待中',
    'tasks.status.stopped': '已停止',
    'tasks.recentEmpty': '暂无历史记录',
    // 批量队列
    'batch.title': '批量队列',
    'batch.empty': '队列为空',
    'batch.start': '开始',
    'batch.pause': '暂停',
    'batch.resume': '继续',
    'batch.clear': '清空',
    'batch.skipped': '已跳过',
    'batch.paused': '已暂停',
    // 搜索
    'search.placeholder': '搜索笔记…',
    'search.empty': '没有找到匹配的笔记',
    'search.all': '全部',
    // 知识关联
    'backlinks.title': '知识关联',
    'backlinks.entities': '实体',
    'backlinks.graph': '图谱',
    'backlinks.tags': '标签',
    'backlinks.compare': '对比',
    'backlinks.searchPlaceholder': '搜索实体或标签…',
    // 设置
    'settings.title': '设置',
    'settings.close': '关闭',
    'settings.api': 'API 配置',
    'settings.export': '导出',
    'settings.platforms': '平台',
    'settings.tools': '工具',
    'settings.transcribe': '转写',
    'settings.whisper': 'Whisper',
    'settings.save': '保存',
    'settings.cancel': '取消',
    'settings.saved': '已保存',
    // 通用按钮
    'common.ok': '确定',
    'common.yes': '是',
    'common.no': '否',
    'common.confirm': '确认',
    'common.cancel': '取消',
    'common.close': '关闭',
    'common.loading': '加载中…',
    'common.copy': '复制',
    'common.copied': '已复制',
    'common.openFolder': '打开文件夹',
    'common.retry': '重试',
    'common.downloading': '下载中…',
    'common.processing': '处理中…',
  },
  en: {
    // 通用
    'app.name': 'PodMuse',
    'app.subtitle': 'Podcast links auto-download, AI summary, write to Obsidian',
    // 顶栏
    'header.processing': 'Processing',
    'header.idle': 'Idle',
    'header.lang': '中文',
    'header.searchPlaceholder': 'Search notes, podcasts, keywords...',
    'header.searching': 'Searching...',
    'header.noResults': 'No matching results',
    'header.clear': 'Clear search',
    'header.light': 'Light',
    'header.dark': 'Dark',
    'header.minimize': 'Minimize',
    'header.maximize': 'Maximize',
    'header.close': 'Close',
    // 侧边栏
    'sidebar.notes': 'Notes',
    'sidebar.search': 'Search',
    'sidebar.backlinks': 'Backlinks',
    'sidebar.batch': 'Batch Queue',
    'sidebar.settings': 'Settings',
    'sidebar.about': 'About',
    'sidebar.version': 'Version',
    'sidebar.stats.title': 'Task Overview',
    'sidebar.stats.running': 'Running',
    'sidebar.stats.queued': 'Queued',
    'sidebar.stats.done': 'Done Today',
    // 输入框
    'url.eyebrow': 'New Task',
    'url.title': 'Paste a link to start',
    'url.placeholder': 'Paste Xiaoyuzhou / Bilibili / YouTube / Douyin link…',
    'url.process': 'Process',
    'url.batch': 'Batch Paste',
    'url.unsupported': 'Platform not supported yet, use a local file instead',
    'url.pasteHint': 'Supports Xiaoyuzhou, Bilibili, YouTube, Douyin, Ximalaya, Apple Podcasts',
    // 步骤面板
    'steps.idle.title': 'Waiting for tasks',
    'steps.idle.subtitle': 'Enter a podcast link or wait for Feishu messages',
    'steps.idle.step1': 'Paste podcast link',
    'steps.idle.step2': 'Auto transcribe & generate notes',
    'steps.idle.step3': 'Push results to Feishu group',
    // 任务
    'tasks.active': 'Active',
    'tasks.recent': 'Recent',
    'tasks.empty': 'No tasks',
    'tasks.cancel': 'Cancel',
    'tasks.retry': 'Retry',
    'tasks.remove': 'Remove',
    'tasks.status.done': 'Done',
    'tasks.status.running': 'Running',
    'tasks.status.error': 'Failed',
    'tasks.status.pending': 'Pending',
    'tasks.status.stopped': 'Stopped',
    'tasks.recentEmpty': 'No history yet',
    // 批量队列
    'batch.title': 'Batch Queue',
    'batch.empty': 'Queue is empty',
    'batch.start': 'Start',
    'batch.pause': 'Pause',
    'batch.resume': 'Resume',
    'batch.clear': 'Clear',
    'batch.skipped': 'Skipped',
    'batch.paused': 'Paused',
    // 搜索
    'search.placeholder': 'Search notes…',
    'search.empty': 'No matching notes found',
    'search.all': 'All',
    // 知识关联
    'backlinks.title': 'Backlinks',
    'backlinks.entities': 'Entities',
    'backlinks.graph': 'Graph',
    'backlinks.tags': 'Tags',
    'backlinks.compare': 'Compare',
    'backlinks.searchPlaceholder': 'Search entities or tags…',
    // 设置
    'settings.title': 'Settings',
    'settings.close': 'Close',
    'settings.api': 'API Config',
    'settings.export': 'Export',
    'settings.platforms': 'Platforms',
    'settings.tools': 'Tools',
    'settings.transcribe': 'Transcribe',
    'settings.whisper': 'Whisper',
    'settings.save': 'Save',
    'settings.cancel': 'Cancel',
    'settings.saved': 'Saved',
    // 通用按钮
    'common.ok': 'OK',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.confirm': 'Confirm',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.loading': 'Loading…',
    'common.copy': 'Copy',
    'common.copied': 'Copied',
    'common.openFolder': 'Open Folder',
    'common.retry': 'Retry',
    'common.downloading': 'Downloading…',
    'common.processing': 'Processing…',
  },
} as const

export type TranslationKey = keyof (typeof dict)['zh']

// ── Context ──

const LANGUAGE_KEY = 'podmuse_language'

interface I18nContextValue {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: key => key,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_KEY)
      return saved === 'en' || saved === 'zh' ? saved : 'zh'
    } catch {
      return 'zh'
    }
  })

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = (l: Language) => {
    setLangState(l)
    try {
      localStorage.setItem(LANGUAGE_KEY, l)
    } catch {}
  }

  const t = (key: TranslationKey): string => {
    const table = dict[lang]
    return table[key] ?? dict.zh[key] ?? key
  }

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
