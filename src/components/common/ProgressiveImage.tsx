import { useEffect, useRef, useState } from 'react'

interface ProgressiveImageProps {
  src: string
  previewSrc: string
  alt: string
}

export default function ProgressiveImage({ src, previewSrc, alt }: ProgressiveImageProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [loadedSrc, setLoadedSrc] = useState('')
  const loaded = loadedSrc === src

  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) setLoadedSrc(src)
  }, [src])

  return (
    <div className="relative w-full">
      <img
        src={previewSrc}
        alt={alt}
        width={640}
        height={480}
        decoding="async"
        className={`w-full rounded-lg ${loaded ? 'hidden' : ''}`}
      />
      <img
        ref={imageRef}
        src={src}
        alt={loaded ? alt : ''}
        aria-hidden={!loaded}
        decoding="async"
        onLoad={() => setLoadedSrc(src)}
        className={`w-full rounded-lg hover:opacity-90 transition-opacity ${loaded ? '' : 'absolute inset-0 opacity-0'}`}
      />
    </div>
  )
}
