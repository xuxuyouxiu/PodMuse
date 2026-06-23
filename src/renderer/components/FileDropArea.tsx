import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Upload, FileAudio, FolderOpen, AlertCircle } from 'lucide-react'

const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.wmv']
const ALLOWED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg']
const ALLOWED_EXTENSIONS = [...ALLOWED_VIDEO_EXTENSIONS, ...ALLOWED_AUDIO_EXTENSIONS]
const EXTENSION_LABELS = ALLOWED_EXTENSIONS.map(e => e.toUpperCase().replace('.', '')).join('、')

interface Props {
  onProcessFile: (filePath: string) => void
  onBatchFiles?: (filePaths: string[]) => void
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
    return window.electronAPI?.getPathForFile?.(file) || file.path || null
  } catch {
    return null
  }
}

export default function FileDropArea({ onProcessFile, onBatchFiles, disabled }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return

    // Validate all files
    const validPaths: string[] = []
    for (const file of files) {
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
      validPaths.push(filePath)
    }

    setError(null)
    if (validPaths.length === 1) {
      onProcessFile(validPaths[0])
    } else if (validPaths.length > 1 && onBatchFiles) {
      onBatchFiles(validPaths)
    } else if (validPaths.length > 1) {
      // No batch handler, process first file only
      onProcessFile(validPaths[0])
    }
  }, [onProcessFile, onBatchFiles])

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
      handleFiles(files)
    }
  }, [disabled, handleFiles])

  const onBrowseClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const onFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(files)
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [handleFiles])

  return (
    <motion.div
      className="file-drop-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1, ease: [0.4, 0, 0.2, 1] }}
    >
      <motion.div
        className="file-drop-zone"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-active={dragOver}
        data-disabled={disabled}
        animate={{
          borderColor: dragOver ? 'var(--accent)' : 'var(--border)',
          scale: dragOver ? 1.02 : 1,
        }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className="file-drop-zone__icon"
          animate={{ scale: dragOver ? 1.2 : 1, rotate: dragOver ? -5 : 0 }}
          transition={{ duration: 0.2 }}
        >
          {dragOver ? <Upload size={32} /> : <FileAudio size={32} />}
        </motion.div>
        <div className="file-drop-zone__text">
          {dragOver ? '释放以添加文件' : '拖拽音视频文件到此处'}
        </div>
        <div className="file-drop-zone__hint">
          支持 {EXTENSION_LABELS} 格式
        </div>
      </motion.div>
      <motion.button
        className="file-drop-browse"
        onClick={onBrowseClick}
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <FolderOpen size={14} />
        浏览文件
      </motion.button>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".mp4,.mov,.avi,.wmv,.mp3,.wav,.aac,.flac,.m4a,.ogg"
        onChange={onFileChange}
        style={{ display: 'none' }}
      />
      <AnimatePresence>
        {error && (
          <motion.div
            className="file-drop-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <AlertCircle size={14} />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
