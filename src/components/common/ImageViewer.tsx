import { useEffect, useState, useRef } from 'react'

interface ImageViewerProps {
  src: string
  alt?: string
  onClose: () => void
}

export default function ImageViewer({ src, alt = '图片', onClose }: ImageViewerProps) {
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const imageRef = useRef<HTMLImageElement>(null)

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Handle wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(Math.max(0.5, scale * delta), 5)
    setScale(newScale)
  }

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1) {
      e.stopPropagation()
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    }
  }

  // Handle drag move
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      e.stopPropagation()
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  // Handle drag end
  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Reset position when scale changes to 1
  useEffect(() => {
    if (scale === 1) {
      setPosition({ x: 0, y: 0 })
    }
  }, [scale])

  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Image */}
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain transition-transform"
        style={{
          transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
        }}
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        draggable={false}
      />

      {/* Instructions */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
        滚轮缩放 | 拖动平移 | 点击外部或按 Esc 关闭
      </div>
    </div>
  )
}
