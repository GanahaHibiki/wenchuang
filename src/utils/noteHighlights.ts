import type { NoteHighlight } from '../types/index.js'

// Offsets use UTF-16, matching textarea.selectionStart/selectionEnd.
export function normalizeNoteHighlights(note: string, ranges: NoteHighlight[] = []): NoteHighlight[] {
  const sorted = ranges
    .filter(range => Number.isInteger(range.start) && Number.isInteger(range.end))
    .map(range => ({ start: Math.max(0, range.start), end: Math.min(note.length, range.end) }))
    .filter(range => range.start < range.end)
    .sort((a, b) => a.start - b.start)
  const result: NoteHighlight[] = []
  for (const range of sorted) {
    const last = result[result.length - 1]
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
    else result.push({ ...range })
  }
  return result
}

export function removeNoteHighlight(ranges: NoteHighlight[], start: number, end: number): NoteHighlight[] {
  return ranges.flatMap(range => {
    if (range.end <= start || range.start >= end) return [range]
    const pieces: NoteHighlight[] = []
    if (range.start < start) pieces.push({ start: range.start, end: start })
    if (range.end > end) pieces.push({ start: end, end: range.end })
    return pieces
  })
}

// Preserve unchanged text's colors. Newly inserted/replaced text starts unmarked.
export function adjustNoteHighlights(before: string, after: string, ranges: NoteHighlight[]): NoteHighlight[] {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start++
  let oldEnd = before.length
  let newEnd = after.length
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  const delta = newEnd - oldEnd
  const result = ranges.flatMap(range => {
    const pieces: NoteHighlight[] = []
    if (range.start < start) pieces.push({ start: range.start, end: Math.min(range.end, start) })
    if (range.end > oldEnd) pieces.push({ start: Math.max(range.start, oldEnd) + delta, end: range.end + delta })
    return pieces
  })
  return normalizeNoteHighlights(after, result)
}
