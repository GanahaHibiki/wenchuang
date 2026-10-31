import { useEffect, useRef } from 'react'
import { useHistoryState } from '@/hooks/useHistoryState'

const BATCH_SIZE = 50

// Preserve the rendered batch count per history entry so deep back-navigation
// can restore its scroll position without mounting the entire catalog initially.
export function useProgressiveList<T>(items: T[], stateKey: string, ready: boolean) {
  const [visibleCount, setVisibleCount] = useHistoryState(stateKey, BATCH_SIZE)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const hasMore = visibleCount < items.length

  useEffect(() => {
    const target = loadMoreRef.current
    if (!ready || !hasMore || !target) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        setVisibleCount(count => Math.min(count + BATCH_SIZE, items.length))
      }
    }, { rootMargin: '600px 0px', threshold: 0 })
    observer.observe(target)
    return () => observer.disconnect()
  }, [ready, hasMore, items.length, visibleCount, setVisibleCount])

  return { visibleItems: items.slice(0, visibleCount), hasMore, loadMoreRef }
}
