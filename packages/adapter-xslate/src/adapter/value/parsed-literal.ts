/**
 * String-literal value lowering for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over const-initializer source text and analyzer
 * type info — no adapter instance state.
 */

import { evalStringArrayJoin, type TypeInfo } from '@barefootjs/jsx'

/**
 * Parse a const initializer's source text. Returns the unescaped string value
 * when the whole initializer is a single pure string literal — single/double
 * quoted, or a no-substitution backtick template (no `${}`) — else `null`.
 * Only such a value can be inlined byte-for-byte; template literals with
 * interpolation, numbers, objects, and `Record<T,string>` maps are excluded.
 */
export function parsePureStringLiteral(source: string): string | null {
  let s = source.trim()
  // Peel a single layer of wrapping parens.
  while (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1).trim()
  const quote = s[0]
  if ((quote === "'" || quote === '"') && s[s.length - 1] === quote) {
    const body = s.slice(1, -1)
    // Reject if an unescaped matching quote appears inside (not a single
    // literal then).
    if (containsUnescaped(body, quote)) return null
    return unescapeStringLiteralBody(body)
  }
  if (quote === '`' && s[s.length - 1] === '`') {
    const body = s.slice(1, -1)
    if (body.includes('${')) return null
    if (containsUnescaped(body, '`')) return null
    return unescapeStringLiteralBody(body)
  }
  // `[<literals>].join(' ')` module consts (e.g. Switch's `trackStateClasses`)
  // → inline the flattened string byte-for-byte. See `evalStringArrayJoin`.
  return evalStringArrayJoin(source)
}

/** Whether `s` contains an unescaped occurrence of `ch`. */
export function containsUnescaped(s: string, ch: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') { i++; continue }
    if (s[i] === ch) return true
  }
  return false
}

/** Unescape a JS string-literal body's common escape sequences. */
export function unescapeStringLiteralBody(s: string): string {
  return s.replace(/\\(.)/g, (_, c) => {
    switch (c) {
      case 'n': return '\n'
      case 'r': return '\r'
      case 't': return '\t'
      case '0': return '\0'
      default: return c
    }
  })
}

/** True when `type` is the `string` primitive. */
export function isStringTypeInfo(type: TypeInfo | undefined): boolean {
  return type?.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression. */
export function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}
