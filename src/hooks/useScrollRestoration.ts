import { useLayoutEffect, type RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { flushNavigationState, getHistoryEntryKey, readScrollPosition, writeScrollPosition } from '@/utils/navigationState'

export function useScrollRestoration(mainRef: RefObject<HTMLElement>) {
  const key = getHistoryEntryKey(useLocation())

  useLayoutEffect(() => {
    const main = mainRef.current
    if (!main) return

    const previousMode = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const target = readScrollPosition(key) || { windowX: 0, windowY: 0, mainX: 0, mainY: 0 }
    let restoring = true
    let frame = 0
    let timeout = 0

    const capture = () => {
      if (restoring) return
      writeScrollPosition(key, {
        windowX: window.scrollX,
        windowY: window.scrollY,
        mainX: main.scrollLeft,
        mainY: main.scrollTop,
      })
    }

    const stopRestoring = () => {
      restoring = false
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.clearTimeout(timeout)
      window.cancelAnimationFrame(frame)
    }

    const restore = () => {
      if (!restoring || main.querySelector('[data-scroll-loading]')) return
      // Wait for asynchronous lists and their restored gallery batches to exist.
      const root = document.scrollingElement || document.documentElement
      const hasRoom = root.scrollHeight - window.innerHeight >= target.windowY - 1
        && root.scrollWidth - window.innerWidth >= target.windowX - 1
        && main.scrollHeight - main.clientHeight >= target.mainY - 1
        && main.scrollWidth - main.clientWidth >= target.mainX - 1

      window.scrollTo({ left: target.windowX, top: target.windowY, behavior: 'instant' })
      main.scrollTo({ left: target.mainX, top: target.mainY, behavior: 'instant' })
      // Original detail images can still change page height after API loading.
      const pendingImage = Array.from(main.querySelectorAll('img'))
        .some(image => image.loading !== 'lazy' && !image.complete)
      if (hasRoom && !pendingImage) stopRestoring()
    }

    const scheduleRestore = () => {
      if (!restoring) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(restore)
    }
    const resizeObserver = new ResizeObserver(scheduleRestore)
    const mutationObserver = new MutationObserver(scheduleRestore)
    const finishWhenReady = () => {
      // A slow API must not expire restoration while the list is still loading.
      if (main.querySelector('[data-scroll-loading]')) {
        timeout = window.setTimeout(finishWhenReady, 1000)
        return
      }
      restore()
      stopRestoring()
      capture()
    }
    timeout = window.setTimeout(finishWhenReady, 10000)
    resizeObserver.observe(main)
    resizeObserver.observe(document.body)
    mutationObserver.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-scroll-loading'] })

    // New history entries start at the top; POP/reload restores their own snapshot.
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    main.scrollTo({ left: 0, top: 0, behavior: 'instant' })
    scheduleRestore()

    const cancelForUser = () => {
      if (restoring) stopRestoring()
      capture()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        cancelForUser()
      }
    }
    // Capture before a link/row navigation, not after the old page has unmounted.
    const handlePointer = () => {
      cancelForUser()
      flushNavigationState()
    }
    const handlePageHide = () => {
      capture()
      flushNavigationState()
    }
    window.addEventListener('scroll', capture, true)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pointerdown', handlePointer, true)
    window.addEventListener('wheel', cancelForUser, { passive: true })
    window.addEventListener('touchstart', cancelForUser, { passive: true })
    window.addEventListener('keydown', handleKey)
    main.addEventListener('load', scheduleRestore, true)
    main.addEventListener('error', scheduleRestore, true)

    return () => {
      // Do not read scroll here: React may already have replaced the old page DOM.
      stopRestoring()
      window.history.scrollRestoration = previousMode
      window.removeEventListener('scroll', capture, true)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pointerdown', handlePointer, true)
      window.removeEventListener('wheel', cancelForUser)
      window.removeEventListener('touchstart', cancelForUser)
      window.removeEventListener('keydown', handleKey)
      main.removeEventListener('load', scheduleRestore, true)
      main.removeEventListener('error', scheduleRestore, true)
    }
  }, [key, mainRef])
}
