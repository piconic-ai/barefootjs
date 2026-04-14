/**
 * Style attribute helpers for client-side DOM updates.
 */

/**
 * Convert a style value (string or object) to a CSS string, or null to remove the attribute.
 *
 * - null/undefined → null (remove the attribute)
 * - string → the string as-is
 * - object → camelCase keys converted to kebab-case, joined with semicolons
 *
 * @example
 * styleToCss({ backgroundColor: 'red', fontSize: '16px' }) // "background-color:red;font-size:16px"
 * styleToCss('color:red')   // "color:red"
 * styleToCss(null)          // null
 */
export function styleToCss(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'object') return String(value)
  const parts: string[] = []
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue
    const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    parts.push(`${prop}:${v}`)
  }
  return parts.join(';') || null
}
