/**
 * Branch-template slot helper (#1213).
 *
 * Conditional `template()` arrows interpolate Child-position expressions
 * via `${expr}`. When `expr` evaluates to a live `Node` (e.g. the result
 * of `_p.renderNode(node())` returning an `HTMLElement` from
 * `createComponent`), the surrounding template literal coerces it via
 * `Object.prototype.toString`, producing `"[object HTMLDivElement]"` and
 * destroying the live node identity on hydration.
 *
 * `__bfSlot` intercepts the value before stringification: if it's a
 * `Node`, it stashes the node into the closure-scoped `slots` array and
 * returns a unique marker comment. The `insert()` runtime then walks the
 * parsed fragment for those markers and splices the original node back
 * in by identity (no `cloneNode`), preserving event listeners and signal
 * bindings.
 *
 * Non-node values fall through to the inline-string path, HTML-escaped
 * (#1694 follow-up) so a branch-template text value containing `< / &`
 * surfaces as text — not markup — and matches the SSR-rendered bytes.
 * Escaping happens here, on the string path only, so the `<!--bf-slot:N-->`
 * markers returned for live `Node` values are left intact for `insert()`
 * to splice. (Doing it here rather than wrapping the whole `__bfSlot(...)`
 * call in `escapeText` is what lets the marker path stay raw.)
 */
import { escapeText } from './component.ts'

export function __bfSlot(value: unknown, slots: Node[]): string {
  if (value == null || value === false || value === true) return ''
  if (typeof Node !== 'undefined' && value instanceof Node) {
    const idx = slots.length
    slots.push(value)
    return `<!--bf-slot:${idx}-->`
  }
  if (Array.isArray(value)) {
    return value.map((v) => __bfSlot(v, slots)).join('')
  }
  return escapeText(value)
}
