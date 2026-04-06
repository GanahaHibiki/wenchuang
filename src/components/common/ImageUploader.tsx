import { useState, useCallback, useRef } from 'react'
import { useClipboardPaste } from '@/hooks/useClipboardPaste'

interface ImageUploaderProps {
  onImageSelect: (file: File) => void
  preview?: string | null
  className?: string
  enableClipboard?: boolean
  alwaysListenClipboard?: boolean // For pages with single product (order entry)
  compact?: boolean // Compact mode for inline editing
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export default function ImageUploader({
  onImageSelect,
  preview,
  className = '',
  enableClipboard = false,
  alwaysListenClipboard = false,
  compact = false,
}: ImageUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const validateAndSelect = useCallback(
    (file: File) => {
      setError(null)

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('仅支持 JPG、PNG、WebP 格式')
        return
      }

      if (file.size > MAX_SIZE) {
        setError('文件大小不能超过 10MB')
        return
      }

      onImageSelect(file)
    },
    [onImageSelect]
  )

  // Handle clipboard paste - always if alwaysListenClipboard, or only when focused if enableClipboard
  useClipboardPaste((file) => {
    if (alwaysListenClipboard || (enableClipboard && isFocused)) {
      validateAndSelect(file)
    }
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      validateAndSelect(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      validateAndSelect(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleClick = () => {
    inputRef.current?.click()
  }

  return (
    <div className={className}>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        tabIndex={enableClipboard ? 0 : -1}
        className={`
          relative border-2 border-dashed rounded-lg text-center cursor-pointer
          transition-colors flex flex-col items-center justify-center
          ${compact ? 'p-2 min-h-[60px]' : 'p-4 min-h-[200px]'}
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${preview ? 'border-solid border-green-500' : ''}
          ${enableClipboard && isFocused ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
          ${enableClipboard ? 'focus:outline-none' : ''}
        `}
      >
        {preview ? (
          <img
            src={preview}
            alt="预览"
            className={compact ? 'max-h-12 max-w-full object-contain' : 'max-h-48 max-w-full object-contain'}
          />
        ) : (
          <>
            <div className={compact ? 'text-xl' : 'text-4xl mb-2'}>📷</div>
            <p className={`text-gray-600 ${compact ? 'text-xs mb-0' : 'mb-1'}`}>
              {compact ? '点击或粘贴' : '点击选择图片 或 拖拽到此处'}
            </p>
            {!compact && alwaysListenClipboard && (
              <p className="text-sm text-gray-400">可直接使用 Ctrl+V 粘贴图片</p>
            )}
            {!compact && enableClipboard && !alwaysListenClipboard && (
              <p className="text-sm text-gray-400">点击此区域后可直接 Ctrl+V 粘贴图片</p>
            )}
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(',')}
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {!compact && (
        <p className="mt-2 text-xs text-gray-400">
          支持格式: JPG, PNG, WebP | 最大 10MB
        </p>
      )}
    </div>
  )
}
