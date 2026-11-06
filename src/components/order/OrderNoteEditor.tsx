import { useRef, useState } from 'react'
import type { NoteHighlight } from '@/types'
import { adjustNoteHighlights, normalizeNoteHighlights, removeNoteHighlight } from '@/utils/noteHighlights'

export function HighlightedNote({ note, highlights = [] }: { note: string; highlights?: NoteHighlight[] }) {
  const parts = []
  let cursor = 0
  for (const range of normalizeNoteHighlights(note, highlights)) {
    if (cursor < range.start) parts.push(<span key={`plain-${cursor}`}>{note.slice(cursor, range.start)}</span>)
    parts.push(<span key={`red-${range.start}`} className="text-red-600">{note.slice(range.start, range.end)}</span>)
    cursor = range.end
  }
  if (cursor < note.length) parts.push(<span key={`plain-${cursor}`}>{note.slice(cursor)}</span>)
  return <div className="min-h-[24px] font-bold whitespace-pre-wrap break-words">{parts}</div>
}

interface Props {
  note: string
  highlights?: NoteHighlight[]
  onSave: (note: string, highlights: NoteHighlight[]) => Promise<void>
  onCancel: () => void
}

export default function OrderNoteEditor({ note: initialNote, highlights: initialHighlights, onSave, onCancel }: Props) {
  const [note, setNote] = useState(initialNote)
  const [highlights, setHighlights] = useState(() => normalizeNoteHighlights(initialNote, initialHighlights))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const busy = useRef(false)
  const cancelled = useRef(false)

  const save = async () => {
    if (busy.current || cancelled.current) return
    busy.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(note, highlights)
    } catch {
      setError('备注保存失败，请重试')
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  const markSelection = (red: boolean) => {
    const input = inputRef.current
    if (!input) return
    const { selectionStart: start, selectionEnd: end } = input
    if (start === end) {
      setError('请先在输入框中选中需要修改颜色的文字')
      input.focus()
      return
    }
    setHighlights(red
      ? normalizeNoteHighlights(note, [...highlights, { start, end }])
      : removeNoteHighlight(highlights, start, end))
    setError('')
    input.focus()
    input.setSelectionRange(start, end)
  }

  return (
    <div
      className="space-y-2"
      onClick={e => e.stopPropagation()}
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void save()
      }}
    >
      <textarea
        ref={inputRef}
        aria-label="编辑备注"
        value={note}
        disabled={saving}
        onChange={e => {
          const next = e.target.value
          setHighlights(adjustNoteHighlights(note, next, highlights))
          setNote(next)
          setError('')
        }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void save()
          } else if (e.key === 'Escape') {
            cancelled.current = true
            onCancel()
          }
        }}
        className="px-2 py-1 border rounded text-sm w-full"
        placeholder="输入备注，选中文字后标红"
        rows={3}
        autoFocus
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" disabled={saving} className="text-red-600 border rounded px-2 py-1" onMouseDown={e => e.preventDefault()} onClick={() => markSelection(true)}>标红选中</button>
        <button type="button" disabled={saving} className="border rounded px-2 py-1" onMouseDown={e => e.preventDefault()} onClick={() => markSelection(false)}>取消选中标红</button>
        <button type="button" disabled={saving} className="text-blue-600 border rounded px-2 py-1" onClick={() => void save()}>{saving ? '保存中...' : '保存'}</button>
        <button type="button" disabled={saving} className="border rounded px-2 py-1" onClick={() => { cancelled.current = true; onCancel() }}>取消</button>
      </div>
      <HighlightedNote note={note} highlights={highlights} />
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
