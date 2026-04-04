import { useEffect, useCallback } from 'react'

export function useClipboardPaste(onImagePaste: (file: File) => void) {
  const handlePaste = useCallback(
    (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            onImagePaste(file)
            event.preventDefault()
            break
          }
        }
      }
    },
    [onImagePaste]
  )

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])
}
