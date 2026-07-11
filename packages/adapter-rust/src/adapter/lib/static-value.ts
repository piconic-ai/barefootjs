/**
 * Serialize a compile-time-evaluated JS value (`@barefootjs/jsx`'s
 * `evaluateStaticLiteral`/`resolveStaticLoopSource`, #2208) into a native
 * MiniJinja literal. Used to inline a fully-static loop source (an inline
 * array literal, or a function-scope local const with a static
 * initializer) directly in a `{% for %}` header, rather than requiring a
 * bound template variable.
 *
 * Returns `null` for a value this adapter can't represent as a literal —
 * the caller falls back to its existing BF101 refusal instead of guessing.
 */

import { escapeMinijinjaSingleQuoted, minijinjaHashKey } from './minijinja-naming.ts'

export function staticValueToMinijinja(value: unknown): string | null {
  if (value === null || value === undefined) return 'none'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapeMinijinjaSingleQuoted(value)}'`
  if (Array.isArray(value)) {
    const items: string[] = []
    for (const el of value) {
      const serialized = staticValueToMinijinja(el)
      if (serialized === null) return null
      items.push(serialized)
    }
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    const entries: string[] = []
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const serialized = staticValueToMinijinja(val)
      if (serialized === null) return null
      entries.push(`${minijinjaHashKey(key)}: ${serialized}`)
    }
    return `{${entries.join(', ')}}`
  }
  return null
}
