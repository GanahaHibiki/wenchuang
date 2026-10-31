import { memo, useEffect, useRef, useState } from 'react'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  onClick?: () => void
}

function LazyImage({ src, alt, className = '', onClick }: LazyImageProps) {
  const [loadedSrc, setLoadedSrc] = useState('')
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    // Cached images may already be complete before the load listener runs.
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) setLoadedSrc(src)
  }, [src])

  return (
    <img
      ref={imageRef}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onClick={onClick}
      onLoad={() => setLoadedSrc(src)}
      onError={() => setLoadedSrc(src)}
      className={`transition-opacity duration-300 ${loadedSrc === src ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}

export default memo(LazyImage)
