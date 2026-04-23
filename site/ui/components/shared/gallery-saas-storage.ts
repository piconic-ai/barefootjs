// Shared session-storage helpers for the /gallery/saas app.
//
// Reactive primitives must stay in each consuming component — the compiler
// only recognizes createSignal / createEffect at the source call site. These
// are pure read/write helpers; components keep their own signal pairs inline.

const NAMESPACE = 'barefoot.gallery.saas'

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
    window.dispatchEvent(new CustomEvent('barefoot:saas-storage', { detail: { key } }))
  } catch {
    /* ignore quota errors */
  }
}

export type BillingCycle = 'monthly' | 'annual'
export type SelectedPlan = 'free' | 'pro' | 'enterprise' | null

export function readBillingCycle(fallback: BillingCycle = 'monthly'): BillingCycle {
  const raw = readRaw('billingCycle')
  if (raw === 'monthly' || raw === 'annual') return raw
  return fallback
}

export function writeBillingCycle(value: BillingCycle): void {
  writeRaw('billingCycle', value)
}

export function readSelectedPlan(fallback: SelectedPlan = null): SelectedPlan {
  const raw = readRaw('selectedPlan')
  if (raw === 'free' || raw === 'pro' || raw === 'enterprise') return raw
  return fallback
}

export function writeSelectedPlan(value: SelectedPlan): void {
  writeRaw('selectedPlan', value == null ? '' : value)
}
