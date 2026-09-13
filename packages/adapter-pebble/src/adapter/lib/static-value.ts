/**
 * Serialize a compile-time-evaluated JS value (`@barefootjs/jsx`'s
 * `evaluateStaticLiteral`/`resolveStaticLoopSource`, #2208) into a native
 * Pebble literal. Used to inline a fully-static loop source (an inline
 * array literal, or a function-scope local const with a static
 * initializer) directly in a `{% for %}` header, rather than requiring a
 * bound template variable.
 *
 * Returns `null` for a value this adapter can't represent as a literal —
 * the caller falls back to its existing BF101 refusal instead of guessing.
 */

import { escapePebbleSingleQuoted, pebbleHashKey } from './pebble-naming.ts'

export function staticValueToPebble(value: unknown): string | null {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapePebbleSingleQuoted(value)}'`
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const el of value) {
      const serialized = staticValueToPebble(el)
      if (serialized === null) return null
      items.push(serialized)
    }
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const serialized = staticValueToPebble(val)
      if (serialized === null) return null
      entries.push(`${pebbleHashKey(key)}: ${serialized}`)
    }
    return `{${entries.join(', ')}}`
  }
  return null
}
