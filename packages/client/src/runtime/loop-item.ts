/**
 * BarefootJS - when a keyed loop row's item counts as changed.
 *
 * A keyed loop keeps a row for each key and, on every reconcile, hands the
 * row the item now at that key. Data that is rebuilt rather than mutated
 * (parsed again, mapped from another array, deserialized) arrives as new
 * objects even where nothing changed, and an identity check alone then
 * re-runs every row. This is the one decision every keyed reconciler uses
 * instead (`mapArray`, `mapArrayAnchored`, `mapArrayLazy`), so rebuilt data
 * reconciles like data that kept its references.
 *
 * Equal means `Object.is`, or two arrays / two plain objects whose own
 * values are `Object.is`-equal one level down. Nested objects compare by
 * reference, class instances and other non-plain objects too. An item that
 * compares equal keeps the row's previous reference, which is what a row
 * reads from then on: the values it can observe are the same.
 */
export function sameLoopItem(prev: unknown, next: unknown): boolean {
  if (Object.is(prev, next)) return true
  if (Array.isArray(prev)) {
    if (!Array.isArray(next) || prev.length !== next.length) return false
    for (let i = 0; i < prev.length; i++) {
      if (!Object.is(prev[i], next[i])) return false
    }
    return true
  }
  if (!isPlainObject(prev) || !isPlainObject(next)) return false
  const keys = Object.keys(prev)
  if (keys.length !== Object.keys(next).length) return false
  for (const key of keys) {
    if (!Object.hasOwn(next, key) || !Object.is(prev[key], next[key])) return false
  }
  return true
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
