/**
 * Returns the local date string in YYYY-MM-DD format.
 * Unlike `new Date().toISOString().slice(0,10)` which uses UTC,
 * this uses the user's local timezone — preventing date-shift issues
 * for users in UTC+8 (Taiwan) during midnight hours.
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
