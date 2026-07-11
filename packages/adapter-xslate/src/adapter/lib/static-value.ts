/**
 * Serialize a compile-time-evaluated JS value (`@barefootjs/jsx`'s
 * `evaluateStaticLiteral`/`resolveStaticLoopSource`, #2208) into a native
 * Text::Xslate (Kolon) literal. Used to inline a fully-static loop source
 * (an inline array literal, or a function-scope local const with a static
 * initializer) directly in a `for EXPR -> $item { ... }` header, rather
 * than requiring a bound template variable.
 *
 * Booleans deliberately return `null` (defer to the caller's BF101
 * refusal) rather than baking a `1`/absent-value stand-in — Kolon has no
 * native boolean literal in this position, and guessing one would diverge
 * from JS's `String(true) === "true"` at render.
 *
 * Returns `null` for a value this adapter can't represent as a literal —
 * the caller falls back to its existing BF101 refusal instead of guessing.
 */

import { escapeKolonSingleQuoted, kolonHashKey } from './kolon-naming.ts'

export function staticValueToKolon(value: unknown): string | null {
  if (value === null || value === undefined) return 'nil'
  if (typeof value === 'boolean') return null
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapeKolonSingleQuoted(value)}'`
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const el of value) {
      const serialized = staticValueToKolon(el)
      if (serialized === null) return null
      items.push(serialized)
    }
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const serialized = staticValueToKolon(val)
      if (serialized === null) return null
      entries.push(`${kolonHashKey(key)} => ${serialized}`)
    }
    return `{ ${entries.join(', ')} }`
  }
  return null
}
