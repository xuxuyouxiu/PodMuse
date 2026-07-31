import { resolve, basename, extname } from 'path'

// Windows 系统敏感目录（小写，用于路径安全检查）
const DANGEROUS_DIRS_LOWER = [
  'c:\\windows',
  'c:\\program files',
  'c:\\program files (x86)',
  'c:\\programdata',
]

/**
 * 仅允许 http:// 和 https:// 协议
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return /^https?:\/\//i.test(url)
}

/**
 * 检查路径是否在允许的基准目录范围内（防止路径遍历）
 */
export function isPathWithinBase(targetPath: string, baseDirs: string[]): boolean {
  const resolved = resolve(targetPath)
  return baseDirs.some(base => {
    const resolvedBase = resolve(base)
    return (
      resolved.toLowerCase().startsWith(resolvedBase.toLowerCase() + '\\') ||
      resolved.toLowerCase() === resolvedBase.toLowerCase()
    )
  })
}

/**
 * 检查路径是否包含目录穿越段（..），仅匹配路径分隔符之间的 ".." 段
 * 不会误杀文件名中的省略号（如 "颜色..."）
 */
function hasPathTraversal(p: string): boolean {
  return p.split(/[\\/]/).some(seg => seg === '..')
}

/**
 * 检查文件路径是否安全（在允许目录内 + 扩展名白名单）
 */
export function isSafeFilePath(
  filePath: string,
  allowedBaseDirs: string[],
  allowedExtensions: string[],
): boolean {
  if (!filePath || typeof filePath !== 'string') return false
  if (hasPathTraversal(filePath)) return false
  const ext = extname(filePath).toLowerCase()
  if (!allowedExtensions.includes(ext)) return false
  return isPathWithinBase(filePath, allowedBaseDirs)
}

/**
 * 检查可执行文件路径是否安全
 * 拒绝系统目录中的可执行文件，防止通过 config:save 篡改 whisper_exe_path 执行恶意程序
 */
export function isSafeExecutablePath(exePath: string): boolean {
  if (!exePath || typeof exePath !== 'string') return false
  if (hasPathTraversal(exePath)) return false

  // 允许空路径（用户尚未配置）
  const trimmed = exePath.trim()
  if (!trimmed) return true

  const name = basename(trimmed).toLowerCase()
  if (!name.endsWith('.exe')) return false

  // 不允许在系统敏感目录中
  const pathLower = trimmed.toLowerCase()
  for (const dir of DANGEROUS_DIRS_LOWER) {
    if (pathLower.startsWith(dir)) return false
  }

  return true
}

/**
 * 检查目录路径是否安全（不在系统敏感目录中）
 */
export function isSafeDirectoryPath(dirPath: string): boolean {
  if (!dirPath || typeof dirPath !== 'string') return false
  const trimmed = dirPath.trim()
  if (!trimmed) return true // 允许空路径

  if (hasPathTraversal(trimmed)) return false

  const pathLower = trimmed.toLowerCase()
  for (const dir of DANGEROUS_DIRS_LOWER) {
    if (pathLower === dir || pathLower.startsWith(dir + '\\')) return false
  }

  return true
}

/**
 * 检查子路径是否在父目录范围内（防止路径遍历）
 * 用于 AI 输出的 category 等不可信内容构建文件路径时的安全检查
 */
export function isSubPathOf(childPath: string, parentPath: string): boolean {
  const resolvedChild = resolve(childPath)
  const resolvedParent = resolve(parentPath)
  const childLower = resolvedChild.toLowerCase()
  const parentLower = resolvedParent.toLowerCase()
  return childLower.startsWith(parentLower + '\\') || childLower === parentLower
}

/**
 * 使用 Electron safeStorage 加密字符串
 * 加密结果以 base64 编码返回
 */
export function encryptField(safeStorage: Electron.SafeStorage, plainText: string): string {
  if (!plainText) return ''
  if (!safeStorage.isEncryptionAvailable()) return plainText
  return safeStorage.encryptString(plainText).toString('base64')
}

/**
 * 使用 Electron safeStorage 解密字符串
 * 如果加密不可用（例如数据以明文存储），则直接返回原文
 * 解密失败时抛出异常，由调用方决定如何处理
 */
export function decryptField(safeStorage: Electron.SafeStorage, cipherText: string): string {
  if (!cipherText) return ''
  if (!safeStorage.isEncryptionAvailable()) return cipherText
  const buf = Buffer.from(cipherText, 'base64')
  return safeStorage.decryptString(buf)
}
