import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import { useLocation } from 'react-router-dom'
import { readViewState, writeViewState } from '@/utils/navigationState'

// App keys Routes by location.key, so each browser history entry has its own view.
// Store only small browsing preferences, not API data, files or form drafts.
export function useHistoryState<T>(name: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const { key } = useLocation()
  const [value, setValue] = useState(() => readViewState(key, name, initialValue))
  const setHistoryValue = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    setValue(previous => {
      const updated = typeof next === 'function'
        ? (next as (value: T) => T)(previous)
        : next
      writeViewState(key, name, updated)
      return updated
    })
  }, [key, name])

  return [value, setHistoryValue]
}
