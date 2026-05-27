/**
 * BarefootJS - Apply Rest Attributes Helper
 *
 * Applies spread attributes to HTML elements at hydration time.
 * Used when spread props cannot be statically expanded (open types).
 */

import { createEffect } from '@barefootjs/client/reactive'
import { classifyDOMProp } from '@barefootjs/shared'
import { styleToCss } from './style'

/**
 * Convert a JSX event prop name to a DOM event name for addEventListener.
 * Handles: camelCase → lowercase, plus special mappings (doubleclick → dblclick).
 * Mirrors the compiler's toDomEventName in packages/jsx/src/ir-to-client-js/utils.ts.
 */
const jsxToDomEventMap: Record<string, string> = { doubleclick: 'dblclick' }
function toEventName(jsxPropName: string): string {
  const raw = (jsxPropName[2].toLowerCase() + jsxPropName.slice(3)).toLowerCase()
  return jsxToDomEventMap[raw] ?? raw
}

/**
 * Reactively apply rest attributes from a props source onto an HTML element.
 * Runs inside a createEffect so attribute values update when props change.
 *
 * @param el - The target DOM element
 * @param source - The props/rest object to read attributes from
 * @param excludeKeys - Keys already handled statically (don't apply twice)
 */
export function applyRestAttrs(
  el: Element,
  source: Record<string, unknown>,
  excludeKeys: string[]
): void {
  const exclude = new Set(excludeKeys)

  // Wire up event handlers and ref callbacks once (not reactively)
  for (const key of Object.keys(source)) {
    if (exclude.has(key)) continue
    const c = classifyDOMProp(key)
    if (c.kind === 'ref') {
      const ref = source[key]
      if (typeof ref === 'function') (ref as (el: Element) => void)(el)
      continue
    }
    if (c.kind === 'event') {
      const handler = source[key]
      if (typeof handler === 'function') {
        el.addEventListener(toEventName(key), handler as EventListener)
      }
    }
  }

  createEffect(() => {
    for (const key of Object.keys(source)) {
      if (exclude.has(key)) continue
      const c = classifyDOMProp(key)
      if (c.kind === 'ref' || c.kind === 'event' || c.kind === 'skip') continue

      const value = source[key]

      if (value != null && value !== false) {
        if (c.kind === 'property' && c.attrName === 'value' && 'value' in el) {
          const strVal = String(value)
          if ((el as HTMLInputElement).value !== strVal) (el as HTMLInputElement).value = strVal
        } else if (c.kind === 'property' && c.attrName === 'checked' && 'checked' in el) {
          (el as HTMLInputElement).checked = !!value
        } else if (c.kind === 'style') {
          const css = styleToCss(value)
          if (css == null) el.removeAttribute('style')
          else el.setAttribute('style', css)
        } else {
          el.setAttribute(c.attrName, String(value))
        }
      } else {
        if (c.kind === 'property' && c.attrName === 'value' && 'value' in el) {
          (el as HTMLInputElement).value = ''
        } else if (c.kind === 'property' && c.attrName === 'checked' && 'checked' in el) {
          (el as HTMLInputElement).checked = false
        } else {
          el.removeAttribute(c.attrName)
        }
      }
    }
  })
}
