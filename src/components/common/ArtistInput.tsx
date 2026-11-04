import { useEffect, useId, useRef, useState } from 'react'
import { productApi } from '@/api/client'

interface ArtistInputProps {
  value?: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function ArtistInput({ value, onChange, disabled = false }: ArtistInputProps) {
  const id = useId()
  const listId = `${id}-artists`
  const listRef = useRef<HTMLUListElement>(null)
  const requestVersion = useRef(0)
  const blurTimer = useRef<number | undefined>(undefined)
  const [artists, setArtists] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const keyword = String(value || '').trim().toLowerCase()
  const matches = artists.filter(artist => artist.toLowerCase().includes(keyword))
  const candidates = matches.slice(0, 50)
  const showList = open && !disabled && candidates.length > 0

  useEffect(() => () => { requestVersion.current++; window.clearTimeout(blurTimer.current) }, [])
  useEffect(() => { setActiveIndex(-1) }, [value])
  useEffect(() => {
    if (!showList || activeIndex < 0) return
    const list = listRef.current
    const option = list?.children[activeIndex] as HTMLElement | undefined
    if (!list || !option) return
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight
    }
  }, [activeIndex, showList])

  const loadCandidates = async () => {
    window.clearTimeout(blurTimer.current)
    const version = ++requestVersion.current
    setOpen(true)
    setActiveIndex(-1)
    setLoading(true)
    setError(false)
    try {
      const names = await productApi.getArtists()
      if (version !== requestVersion.current) return
      if (!Array.isArray(names) || names.some(name => typeof name !== 'string')) throw new Error('Invalid artist list')
      setArtists(names)
      setActiveIndex(-1)
    } catch {
      if (version === requestVersion.current) setError(true)
    } finally {
      if (version === requestVersion.current) setLoading(false)
    }
  }

  const select = (artist: string) => {
    onChange(artist)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">美工（选填）</label>
      <div className="relative">
        <input id={id} type="text" value={value || ''} disabled={disabled} maxLength={120}
          role="combobox" aria-autocomplete="list" aria-expanded={showList} aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off" placeholder="请输入美工名称"
          onFocus={loadCandidates}
          onClick={() => { window.clearTimeout(blurTimer.current); setOpen(true) }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 200) }}
          onChange={event => { onChange(event.target.value); setOpen(true); setActiveIndex(-1) }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation(); setOpen(false); setActiveIndex(-1)
              return
            }
            if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && candidates.length) {
              event.preventDefault()
              setOpen(true)
              setActiveIndex(index => event.key === 'ArrowDown' ? (index + 1) % candidates.length : index <= 0 ? candidates.length - 1 : index - 1)
            } else if (event.key === 'Enter' && showList && activeIndex >= 0) {
              event.preventDefault()
              select(candidates[activeIndex])
            }
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {showList && (
          <ul ref={listRef} id={listId} role="listbox" aria-label="已录入美工"
            className="absolute z-30 left-0 right-0 top-full mt-1 max-h-40 overflow-y-auto border rounded-lg bg-white shadow-lg">
            {candidates.map((artist, index) => (
              <li key={artist} id={`${listId}-${index}`} role="option" aria-selected={activeIndex === index}
                onMouseDown={event => event.preventDefault()} onClick={() => select(artist)}
                className={`px-3 py-2 text-sm cursor-pointer break-words ${activeIndex === index ? 'bg-blue-50' : 'hover:bg-gray-100'}`}>
                {artist}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p role={error ? 'alert' : loading ? 'status' : undefined}
        className={`text-xs mt-1 ${error ? 'text-red-600' : 'text-gray-500'}`}>
        {error ? '候选加载失败，可继续手动输入，重新聚焦可重试。'
          : loading ? '正在加载已录入美工...'
          : matches.length > 50 ? '显示前50个候选，请输入名称筛选。'
          : candidates.length === 0 ? '没有匹配候选，可输入新的美工名称。'
          : '可选择已录入美工，也可手动输入新名称。'}
      </p>
    </div>
  )
}
