/**
 * Serialize a compile-time-evaluated JS value (`@barefootjs/jsx`'s
 * `evaluateStaticLiteral`/`resolveStaticLoopSource`, #2208) into a native
 * Perl literal. Used to inline a fully-static loop source (an inline array
 * literal, or a function-scope local const with a static initializer)
 * directly in the loop-bound expression, rather than requiring a bound
 * template variable.
 *
 * Booleans deliberately return `null` (defer to the caller's BF101
 * refusal) rather than baking `1`/`''` — Perl has no boolean literal, and
 * that would diverge from JS's `String(true) === "true"` at render.
 *
 * Returns `null` for a value this adapter can't represent as a literal —
 * the caller falls back to its existing BF101 refusal instead of guessing.
 */

import { perlHashKey } from './perl-naming.ts'

function escapePerlSingleQuote(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function staticValueToPerl(value: unknown): string | null {
  if (value === null || value === undefined) return 'undef'
  if (typeof value === 'boolean') return null
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapePerlSingleQuote(value)}'`
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const el of value) {
      const serialized = staticValueToPerl(el)
      if (serialized === null) return null
      items.push(serialized)
    }
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const serialized = staticValueToPerl(val)
      if (serialized === null) return null
      entries.push(`${perlHashKey(key)} => ${serialized}`)
    }
    return `{ ${entries.join(', ')} }`
  }
  return null
}
