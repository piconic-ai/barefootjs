/**
 * BarefootJS - Spread Attributes Helper (Template Mode)
 *
 * Converts an object to an HTML attribute string for use inside template literals.
 * Unlike applyRestAttrs (which manipulates DOM elements reactively), this produces
 * a static string for server/template rendering of computed local spreads.
 */

import { classifyDOMProp } from '@barefootjs/shared'
import { styleToCss } from './style'

/**
 * Convert an object to an HTML attribute string.
 * Uses the shared classifyDOMProp classifier to determine how each prop
 * maps to the DOM. Skips null/undefined/false, event handlers, ref, and
 * children. The `style` prop is routed through `styleToCss` so object
 * literals serialize to a real CSS string.
 */
export function spreadAttrs(obj: Record<string, unknown>): string {
  if (!obj || typeof obj !== 'object') return ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || value === false) continue
    const c = classifyDOMProp(key)
    if (c.kind === 'event' || c.kind === 'skip' || c.kind === 'ref') continue
    // `dangerouslySetInnerHTML` is not an attribute — its `{ __html }` is the
    // element's content, which this attribute-string builder can't emit. Skip
    // it so a spread carrying it never serialises a bogus
    // `dangerouslySetInnerHTML="[object Object]"`. (Content is set by the
    // template for an explicit attr, or by `applyRestAttrs` for a rest object.)
    if (c.kind === 'innerHTML') continue
    if (c.kind === 'style') {
      const css = styleToCss(value)
      if (css != null) parts.push(`style="${css}"`)
      continue
    }
    if (c.kind === 'boolean' && value === true) {
      parts.push(c.attrName)
    } else {
      parts.push(`${c.attrName}="${value}"`)
    }
  }
  return parts.join(' ')
}
