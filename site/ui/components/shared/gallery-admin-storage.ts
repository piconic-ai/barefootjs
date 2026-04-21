// Shared session-storage helpers for the /gallery/admin pilot app.
//
// The reactive primitives deliberately live in each consuming component: the
// BarefootJS compiler only recognizes `createSignal` / `createEffect` at the
// source call site, so wrapping them behind a helper like
// `createPersistentSignal` hides the signal graph and leaves the generated
// client JS without initialization code. Instead, components keep their
// `createSignal(readX())` + `createEffect(() => writeX(x()))` pairs inline and
// borrow only the pure read/write helpers from this module.

const NAMESPACE = 'barefoot.gallery.admin'

function storageKey(key: string): string {
  return `${NAMESPACE}.${key}`
}

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage.getItem(storageKey(key))
  } catch {
    return null
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey(key), value)
    window.dispatchEvent(new CustomEvent('barefoot:admin-storage', { detail: { key } }))
  } catch {
    /* ignore quota errors */
  }
}

export type TimeRange = '7d' | '30d' | '90d'

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

export const TIME_RANGE_MULTIPLIER: Record<TimeRange, number> = {
  '7d': 0.3,
  '30d': 1,
  '90d': 2.6,
}

function isTimeRange(value: string | null): value is TimeRange {
  return value === '7d' || value === '30d' || value === '90d'
}

export function readTimeRange(fallback: TimeRange = '30d'): TimeRange {
  const raw = readRaw('timeRange')
  return isTimeRange(raw) ? raw : fallback
}

export function writeTimeRange(value: TimeRange): void {
  writeRaw('timeRange', value)
}

export function readUnreadCount(fallback = 0): number {
  const raw = readRaw('unreadCount')
  if (raw == null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function writeUnreadCount(value: number): void {
  writeRaw('unreadCount', String(value))
}
