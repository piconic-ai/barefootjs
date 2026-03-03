/**
 * BarefootJS - Spread Attributes Helper (Template Mode)
 *
 * Converts an object to an HTML attribute string for use inside template literals.
 * Unlike applyRestAttrs (which manipulates DOM elements reactively), this produces
 * a static string for server/template rendering of computed local spreads.
 */

/**
 * Convert an object to an HTML attribute string.
 * Aligned with applyRestAttrs conventions: skips null/undefined/false,
 * event handlers, maps className→class and htmlFor→for.
 */
export function spreadAttrs(obj: Record<string, unknown>): string {
  if (!obj || typeof obj !== 'object') return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === false) continue
    // Skip event handlers
    if (key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()) continue
    // Skip children prop
    if (key === 'children') continue
    // Map JSX prop names to HTML attribute names
    const attr = key === 'className' ? 'class' : key === 'htmlFor' ? 'for'
      : key.replace(/([A-Z])/g, '-$1').toLowerCase()
    parts.push(value === true ? attr : `${attr}="${value}"`)
  }
  return parts.join(' ')
}
