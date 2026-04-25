import { useState } from 'react'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  onClick?: () => void
}

export default function LazyImage({ src, alt, className = '', onClick }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onLoad={() => setLoaded(true)}
      className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  )
}
