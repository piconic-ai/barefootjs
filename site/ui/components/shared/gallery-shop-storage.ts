// Shared session-storage helpers for the /gallery/shop app.
//
// Reactive primitives must stay in each consuming component — the compiler
// only recognizes createSignal / createEffect at the source call site. These
// are pure read/write helpers; components keep their own signal pairs inline.

const NAMESPACE = 'barefoot.gallery.shop'

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
    window.dispatchEvent(new CustomEvent('barefoot:shop-storage', { detail: { key } }))
  } catch {
    /* ignore quota errors */
  }
}

export function readCartCount(fallback = 0): number {
  const raw = readRaw('cartCount')
  if (raw == null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function writeCartCount(value: number): void {
  writeRaw('cartCount', String(value))
}
