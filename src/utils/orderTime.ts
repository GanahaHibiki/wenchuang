// Convert full-width ASCII (including digits, colon and hyphen) and ideographic space.
export function normalizeOrderTime(value: string): string {
  return value.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
}

export function parseOrderTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(normalizeOrderTime(value).trim())
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(hour, minute, second, 0)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day ||
    date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return null
  return date
}
