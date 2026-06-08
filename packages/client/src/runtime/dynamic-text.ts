/**
 * Dynamic text/JSX slot updater (#1663).
 *
 * The compiler wraps reactive child expressions (`<div>{expr}</div>`) in a
 * `createEffect` that writes the value into the text node sitting between
 * the slot's `<!--bf:sX-->` / `<!--/-->` comment markers. That was a pure
 * `nodeValue = String(value)` assignment, which is correct for primitives
 * but destroys a live `Node` — e.g. when `expr` is a JSX-returning call such
 * as `{themeLogo(id)}` / `{LOGOS[id]()}` whose value is the `HTMLElement`
 * returned by `createComponent`. Stringifying it produced
 * `"[object HTMLElement]"` (and clobbered the server-rendered subtree).
 *
 * Profiler note (#1690, §4.2.2): each write reports an output fingerprint via
 * `__bfReportOutput` — `false` when the slot already held the same text/node, so
 * the wasted-re-runs analysis can flag a text binding that re-ran without
 * changing the DOM. Dev-only: `__bfReportOutput` is a no-op when profiling is off.
 *
 * `__bfText` mirrors `__bfSlot` (the branch-template equivalent): when the
 * value is a `Node`, it replaces the slot region with that node by identity;
 * otherwise it behaves exactly like the previous text assignment. It returns
 * the node that now occupies the slot so the caller can track it across
 * reactive re-runs (the previous node is detached once replaced).
 */

import { __bfReportOutput } from '@barefootjs/client/reactive'

const END_MARKER = '/'

/** Remove every sibling between `start` (the `<!--bf:sX-->` comment) and the
 *  matching `<!--/-->` end comment, leaving both markers in place. When `keep`
 *  is supplied that node is left in place (used when writing a primitive
 *  through a text anchor that must survive while stale siblings are cleared). */
function clearSlotRegion(start: Node, keep?: Node): void {
  let n = start.nextSibling
  while (
    n &&
    !(n.nodeType === Node.COMMENT_NODE && (n as Comment).nodeValue === END_MARKER)
  ) {
    const next = n.nextSibling
    if (n !== keep) n.parentNode?.removeChild(n)
    n = next
  }
}

/** Walk back from `node` to the nearest preceding comment marker (the slot's
 *  `<!--bf:sX-->` start), skipping any stale element siblings in between. */
function slotStart(node: Node): Node | null {
  let n = node.previousSibling
  while (n && n.nodeType !== Node.COMMENT_NODE) n = n.previousSibling
  return n
}

export function __bfText(current: Node | null, value: unknown): Node | null {
  if (!current) return current
  // Slot markers (`__slot()`): leave the server-rendered DOM untouched.
  if (value != null && (value as { __isSlot?: boolean }).__isSlot) return current

  if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value === current) {
      __bfReportOutput(false) // same node already in the slot — nothing changed
      return current
    }
    const start = current.previousSibling
    __bfReportOutput(true)
    if (start && start.nodeType === Node.COMMENT_NODE) {
      clearSlotRegion(start)
      start.parentNode?.insertBefore(value, start.nextSibling)
      return value
    }
    // No marker to anchor against — best-effort in-place replacement.
    current.parentNode?.replaceChild(value, current)
    return value
  }

  const text = String(value ?? '')
  if (current.nodeType === Node.TEXT_NODE) {
    __bfReportOutput(current.nodeValue !== text)
    current.nodeValue = text
    // The conditional-slot path re-resolves the anchor via `$t()` on every
    // run, which can hand back a freshly created text node sitting *before* a
    // stale element left by a previous Node-valued run. Clear any remaining
    // siblings up to the end marker so switching JSX → text doesn't render
    // both the old element and the new text.
    const start = slotStart(current)
    if (start && start.nodeType === Node.COMMENT_NODE) clearSlotRegion(start, current)
    return current
  }

  // Switching back from a Node value to text: drop the element and restore a
  // text node in the slot region.
  __bfReportOutput(true)
  const start = current.previousSibling
  const textNode = (current.ownerDocument ?? document).createTextNode(text)
  if (start && start.nodeType === Node.COMMENT_NODE) {
    clearSlotRegion(start)
    start.parentNode?.insertBefore(textNode, start.nextSibling)
  } else {
    current.parentNode?.replaceChild(textNode, current)
  }
  return textNode
}
