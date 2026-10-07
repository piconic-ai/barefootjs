/**
 * BarefootJS - Apply Rest Attributes Helper
 *
 * Applies spread attributes to HTML elements at hydration time.
 * Used when spread props cannot be statically expanded (open types).
 */

import { beginTurn, createEffect, endTurn } from '@barefootjs/client/reactive'
import { classifyDOMProp, type DOMPropClassification } from '@barefootjs/shared'
import { styleToCss } from './style.ts'

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
 * @param turnSite - Profile mode only (#3376): the compiler passes this spread
 *   site's handler id prefix (`<Component>#handler:<slotId>`), and every event
 *   handler wired here is bracketed with `beginTurn("<turnSite>:<event>")` /
 *   `endTurn()`, exactly like an explicit JSX `on*` handler, so the work a
 *   rest-forwarded callback triggers is attributed to an interaction turn.
 *   Production builds never pass it, so their listeners are the bare handlers.
 */
export function applyRestAttrs(
  el: Element,
  source: Record<string, unknown>,
  excludeKeys: string[],
  turnSite?: string,
): void {
  const exclude = new Set(excludeKeys)

  // Precompute classifications once — keys are stable for rest props.
  const classified: Array<{ key: string; c: DOMPropClassification }> = []
  for (const key of Object.keys(source)) {
    if (exclude.has(key)) continue
    classified.push({ key, c: classifyDOMProp(key) })
  }

  // Wire up event handlers and ref callbacks once (not reactively)
  for (const { key, c } of classified) {
    if (c.kind === 'ref') {
      const ref = source[key]
      if (typeof ref === 'function') (ref as (el: Element) => void)(el)
    } else if (c.kind === 'event') {
      const handler = source[key]
      if (typeof handler === 'function') {
        const eventName = toEventName(key)
        const handlerId = turnSite === undefined ? undefined : `${turnSite}:${eventName}`
        el.addEventListener(
          eventName,
          handlerId === undefined
            ? (handler as EventListener)
            : function (this: unknown, ...args: unknown[]) {
                // `function` + `apply` keep the DOM receiver (`this` is the
                // element) the bare listener would get.
                beginTurn(handlerId)
                try {
                  return (handler as (...a: unknown[]) => unknown).apply(this, args)
                } finally {
                  endTurn()
                }
              },
        )
      }
    }
  }

  // Filter to only attr-like entries for the reactive loop
  const attrEntries = classified.filter(
    ({ c }) => c.kind !== 'ref' && c.kind !== 'event' && c.kind !== 'skip',
  )

  createEffect(() => {
    for (const { key, c } of attrEntries) {
      const value = source[key]

      if (c.kind === 'innerHTML') {
        // `dangerouslySetInnerHTML={{ __html }}` arriving via a rest object —
        // set the element's raw innerHTML (the escape hatch), never an
        // attribute. Reactive: re-runs when `source` changes.
        const html = value as { __html?: unknown } | null | undefined
        el.innerHTML = html != null && html.__html != null ? String(html.__html) : ''
      } else if (value != null && value !== false) {
        if (c.kind === 'property' && c.attrName === 'value' && 'value' in el) {
          const strVal = String(value)
          if ((el as HTMLInputElement).value !== strVal) (el as HTMLInputElement).value = strVal
        } else if (c.kind === 'property' && c.attrName === 'checked' && 'checked' in el) {
          (el as HTMLInputElement).checked = !!value
        } else if (c.kind === 'boolean') {
          el.setAttribute(c.attrName, '')
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
        } else if (c.kind === 'boolean') {
          el.removeAttribute(c.attrName)
        } else {
          el.removeAttribute(c.attrName)
        }
      }
    }
  })
}
