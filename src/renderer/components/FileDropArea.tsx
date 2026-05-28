import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'

const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv']
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.flac']
const ALLOWED_EXTENSIONS = [...ALLOWED_VIDEO_EXTENSIONS, ...ALLOWED_AUDIO_EXTENSIONS]
const EXTENSION_LABELS = ALLOWED_EXTENSIONS.map(e => e.toUpperCase().replace('.', '')).join('、')

interface Props {
  onProcessFile: (filePath: string) => void
  disabled: boolean
}

function validateFile(file: File): string | null {
  const name = file.name.toLowerCase()
  const ext = name.substring(name.lastIndexOf('.'))
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `不支持的文件格式（${file.name}），仅允许: ${EXTENSION_LABELS}`
  }
  return null
}

function getFilePath(file: File): string | null {
  try {
    return window.electronAPI?.getPathForFile?.(file) || (file as any).path || null
  } catch {
    return null
  }
}

export default function FileDropArea({ onProcessFile, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const err = validateFile(file)
    if (err) {
      setError(err)
      return
    }
    const filePath = getFilePath(file)
    if (!filePath) {
      setError('无法获取文件路径，请重试')
      return
    }
    setError(null)
    onProcessFile(filePath)
  }, [onProcessFile])

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragOver(true)
  }, [disabled])

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (disabled) return
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [disabled, handleFile])

  const onBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [handleFile])

  return (
    <div className="file-drop-card">
      <div className="file-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-active={dragOver}
        data-disabled={disabled}
      >
        <div className="file-drop-zone__icon">
          {dragOver ? '📥' : '🎙️'}
        </div>
        <div className="file-drop-zone__text">
          {dragOver ? '释放以添加文件' : '拖拽音视频文件到此处'}
        </div>
        <div className="file-drop-zone__hint">
          支持 {EXTENSION_LABELS} 格式
        </div>
      </div>
      <button
        className="file-drop-browse"
        onClick={onBrowseClick}
        disabled={disabled}
      >
        浏览文件
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.avi,.wmv,.mp3,.wav,.aac,.flac"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      {error && (
        <div className="file-drop-error">{error}</div>
      )}
    </div>
  )
}
