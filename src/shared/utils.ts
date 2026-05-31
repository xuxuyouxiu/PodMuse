/**
 * 清理标题，移除期数、日期等标识，保留主要标题
 * 移除：期数（第X期、EP01、Vol5）、日期（2024-01-01、2024.01.01）、分隔符（-、|、：）、文件路径
 */
export function cleanTitle(title: string): string {
  if (!title) return ''
  
  let cleaned = title
  
  // URL 链接不做路径分割
  const isUrl = /^https?:\/\//.test(cleaned)
  
  if (!isUrl) {
    // 如果是文件路径，提取文件名（不含扩展名）
    const isFilePath = /^[a-zA-Z]:\\/.test(cleaned) || /^\//.test(cleaned) || cleaned.includes('\\') || cleaned.includes('/')
    if (isFilePath) {
      // 提取文件名部分（最后一个路径段）
      const parts = cleaned.split(/[\\\/]/)
      cleaned = parts[parts.length - 1] || cleaned
      // 移除文件扩展名
      cleaned = cleaned.replace(/\.[^.]+$/, '')
      // 移除常见的音频后缀（如 _music、_audio、_sound）
      cleaned = cleaned.replace(/[_\-]?(music|audio|sound|podcast)$/i, '')
    }
  }
  
  // 移除日期前缀：2026-05-18_、2024-01-01-、2024.01.01_ 等
  cleaned = cleaned.replace(/^\d{4}[-.]?\d{2}[-.]?\d{2}[_\-\s]+/, '')
  
  cleaned = cleaned
    // 移除期数前缀：第X期、第X季、EP01、Episode 1、Vol5、Vol.5 等
    .replace(/^(第\d+[期季集部季]\s*[-|：:]?\s*)/i, '')
    .replace(/^(EP?\s*\d+\s*[-|：:]?\s*)/i, '')
    .replace(/^(Episode\s*\d+\s*[-|：:]?\s*)/i, '')
    .replace(/^(Vol\.?\s*\d+\s*[-|：:.]?\s*)/i, '')
    .replace(/^(Volume\s*\d+\s*[-|：:.]?\s*)/i, '')
    .replace(/^(V\d+\s*[-|：:.]?\s*)/i, '')
    // 移除日期：2024-01-01、2024.01.01、20240101 等
    .replace(/\s*[-|：:]?\s*\d{4}[-.]?\d{2}[-.]?\d{2}\s*$/, '')
    .replace(/\s*[-|：:]?\s*\d{4}年\d{1,2}月\d{1,2}日\s*$/, '')
    // 移除首尾的分隔符和空格
    .replace(/^[\s\-|：:]+/, '')
    .replace(/[\s\-|：:]+$/, '')
    .trim()
  
  // 如果标题太长（超过50个字符），截取前50个字符并添加省略号
  if (cleaned.length > 50) {
    cleaned = cleaned.substring(0, 50) + '...'
  }
  
  return cleaned || title
}

/**
 * 清理文件名，移除非法字符
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\n\r\t]/g, '_').trim()
}

/**
 * 清理标题并生成安全的文件名
 */
export function cleanTitleForFilename(title: string): string {
  const cleaned = cleanTitle(title)
  return sanitizeFilename(cleaned || '未命名播客')
}
