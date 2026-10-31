export interface ScrollPosition {
  windowX: number
  windowY: number
  mainX: number
  mainY: number
}

interface HistoryEntry {
  scroll?: ScrollPosition
  views: Record<string, unknown>
}

const STORAGE_KEY = 'wenchuang:navigation:v1'
const MAX_ENTRIES = 80
let entries: Record<string, HistoryEntry> | undefined

function getEntries(): Record<string, HistoryEntry> {
  if (!entries) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
      entries = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    } catch {
      entries = {}
    }
  }
  return entries!
}

function saveEntry(key: string, update: (entry: HistoryEntry) => HistoryEntry) {
  const store = getEntries()
  const entry = update(store[key] || { views: {} })
  // Keep recent entries, including entries revisited through back/forward.
  delete store[key]
  store[key] = entry
  for (const oldKey of Object.keys(store).slice(0, -MAX_ENTRIES)) {
    delete store[oldKey]
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Navigation still works in memory if storage is disabled or full.
  }
}

export function readViewState<T>(key: string, name: string, initialValue: T): T {
  return (getEntries()[key]?.views?.[name] as T | undefined) ?? initialValue
}

export function writeViewState<T>(key: string, name: string, value: T) {
  saveEntry(key, entry => ({ ...entry, views: { ...entry.views, [name]: value } }))
}

export function readScrollPosition(key: string): ScrollPosition | undefined {
  return getEntries()[key]?.scroll
}

export function writeScrollPosition(key: string, scroll: ScrollPosition) {
  saveEntry(key, entry => ({ ...entry, scroll }))
}
