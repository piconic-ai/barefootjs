/**
 * Serialize a compile-time-evaluated JS value (`@barefootjs/jsx`'s
 * `evaluateStaticLiteral`/`resolveStaticLoopSource`, #2208) into a native
 * Ruby literal. Used to inline a fully-static loop source (an inline array
 * literal, or a function-scope local const with a static initializer)
 * directly in the loop-bound expression, rather than requiring a bound
 * template variable.
 *
 * Hash keys render as symbols (`label: 'Alpha'`) to match `item[:label]`,
 * this adapter's existing member-access convention (`rubyLocal`'s
 * companion, `rubySymbolKey`/`rubySymbolLiteral`).
 *
 * Returns `null` for a value this adapter can't represent as a literal —
 * the caller falls back to its existing BF101 refusal instead of guessing.
 */

import { rubyStringLiteral, rubySymbolKey } from './ruby-naming.ts'

export function staticValueToRuby(value: unknown): string | null {
  if (value === null || value === undefined) return 'nil'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return rubyStringLiteral(value)
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const el of value) {
      const serialized = staticValueToRuby(el)
      if (serialized === null) return null
      items.push(serialized)
    }
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const serialized = staticValueToRuby(val)
      if (serialized === null) return null
      entries.push(`${rubySymbolKey(key)} ${serialized}`)
    }
    return `{ ${entries.join(', ')} }`
  }
  return null
}
