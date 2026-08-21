/**
 * 跨进程共享常量。
 */

/**
 * 在线教程地址（设置页「打开在线教程」按钮，docs/配置体系优化落地实现方案.md §1.6）。
 * 平台 UI 改版时先更新在线文档应急，再随版本更新内置截图。
 * 暂指向 GitHub README（#readme 锚点直达）；后续替换为官方飞书文档链接后再发版。
 * 留空字符串则隐藏按钮（占位/未准备好时）。
 */
export const GUIDE_ONLINE_URL = 'https://github.com/xuxuyouxiu/PodMuse#readme'

/**
 * OAuth 本地回调固定端口与完整地址。
 * 平台（飞书/Notion）要求 redirect_uri 与后台登记的重定向 URL 完全一致，
 * 因此端口必须固定（随机端口无法预登记，会报飞书 20029「重定向 URL 有误」）。
 * 设置页会展示该地址，引导用户到平台后台添加一次即可。
 */
export const FEISHU_OAUTH_PORT = 47839
export const FEISHU_OAUTH_REDIRECT_URI = 'http://localhost:47839/feishu/callback'
export const NOTION_OAUTH_PORT = 47840
export const NOTION_OAUTH_REDIRECT_URI = 'http://localhost:47840/notion/callback'
