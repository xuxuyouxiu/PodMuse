import { describe, it, expect } from 'vitest'
import { isSafeUrl, isSafeFilePath, isSafeExecutablePath, isSafeDirectoryPath, isSubPathOf } from '../src/main/security'

describe('isSafeUrl', () => {
  it('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true)
  })
  it('accepts https URLs', () => {
    expect(isSafeUrl('https://example.com/path')).toBe(true)
  })
  it('rejects non-http protocols', () => {
    expect(isSafeUrl('\\etc\\passwd')).toBe(false)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
  })
  it('rejects empty/null', () => {
    expect(isSafeUrl('')).toBe(false)
  })
})

describe('isSafeFilePath', () => {
  const baseDirs = ['C:\\Users\\test\\obsidian']
  const extensions = ['.md', '.txt', '.pdf']

  it('accepts valid file in allowed dir', () => {
    expect(isSafeFilePath('C:\\Users\\test\\obsidian\\notes\\test.md', baseDirs, extensions)).toBe(true)
  })
  it('rejects path traversal', () => {
    expect(isSafeFilePath('C:\\Users\\test\\obsidian\\..\\..\\system.md', baseDirs, extensions)).toBe(false)
  })
  it('rejects wrong extension', () => {
    expect(isSafeFilePath('C:\\Users\\test\\obsidian\\evil.exe', baseDirs, extensions)).toBe(false)
  })
  it('rejects path outside allowed dirs', () => {
    expect(isSafeFilePath('C:\\Windows\\system32\\test.md', baseDirs, extensions)).toBe(false)
  })
})

describe('isSafeExecutablePath', () => {
  it('accepts normal exe path', () => {
    expect(isSafeExecutablePath('C:\\Tools\\whisper\\faster-whisper.exe')).toBe(true)
  })
  it('rejects system directory', () => {
    expect(isSafeExecutablePath('C:\\Windows\\system32\\cmd.exe')).toBe(false)
  })
  it('rejects path traversal', () => {
    expect(isSafeExecutablePath('C:\\Tools\\..\\..\\evil.exe')).toBe(false)
  })
  it('rejects non-exe', () => {
    expect(isSafeExecutablePath('C:\\Tools\\script.bat')).toBe(false)
  })
  it('rejects empty path (falsy guard)', () => {
    expect(isSafeExecutablePath('')).toBe(false)
  })
  it('accepts whitespace-only path as empty', () => {
    expect(isSafeExecutablePath('   ')).toBe(true)
  })
})

describe('isSafeDirectoryPath', () => {
  it('accepts normal directory', () => {
    expect(isSafeDirectoryPath('C:\\Users\\test\\notes')).toBe(true)
  })
  it('rejects system directory', () => {
    expect(isSafeDirectoryPath('C:\\Windows')).toBe(false)
    expect(isSafeDirectoryPath('C:\\Program Files')).toBe(false)
  })
  it('rejects path traversal', () => {
    expect(isSafeDirectoryPath('C:\\Users\\..\\..')).toBe(false)
  })
  it('rejects empty string (falsy guard)', () => {
    // Empty string is falsy, so the guard `if (!dirPath) return false` fires
    expect(isSafeDirectoryPath('')).toBe(false)
  })
  it('accepts whitespace-only path as empty', () => {
    expect(isSafeDirectoryPath('   ')).toBe(true)
  })
})

describe('isSubPathOf', () => {
  it('returns true for child path', () => {
    expect(isSubPathOf('C:\\Users\\test\\obsidian\\notes', 'C:\\Users\\test\\obsidian')).toBe(true)
  })
  it('returns true for same path', () => {
    expect(isSubPathOf('C:\\Users\\test\\obsidian', 'C:\\Users\\test\\obsidian')).toBe(true)
  })
  it('returns false for parent path', () => {
    expect(isSubPathOf('C:\\Users', 'C:\\Users\\test\\obsidian')).toBe(false)
  })
  it('returns false for sibling path', () => {
    expect(isSubPathOf('C:\\Users\\other', 'C:\\Users\\test\\obsidian')).toBe(false)
  })
})
