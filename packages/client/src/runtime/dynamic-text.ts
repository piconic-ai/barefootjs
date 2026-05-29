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
 * `__bfText` mirrors `__bfSlot` (the branch-template equivalent): when the
 * value is a `Node`, it replaces the slot region with that node by identity;
 * otherwise it behaves exactly like the previous text assignment. It returns
 * the node that now occupies the slot so the caller can track it across
 * reactive re-runs (the previous node is detached once replaced).
 */

const END_MARKER = '/'

/** Remove every sibling between `start` (the `<!--bf:sX-->` comment) and the
 *  matching `<!--/-->` end comment, leaving both markers in place. */
function clearSlotRegion(start: Node): void {
  let n = start.nextSibling
  while (
    n &&
    !(n.nodeType === Node.COMMENT_NODE && (n as Comment).nodeValue === END_MARKER)
  ) {
    const next = n.nextSibling
    n.parentNode?.removeChild(n)
    n = next
  }
}

export function __bfText(current: Node | null, value: unknown): Node | null {
  if (!current) return current
  // Slot markers (`__slot()`): leave the server-rendered DOM untouched.
  if (value != null && (value as { __isSlot?: boolean }).__isSlot) return current

  if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value === current) return current
    const start = current.previousSibling
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
    current.nodeValue = text
    return current
  }

  // Switching back from a Node value to text: drop the element and restore a
  // text node in the slot region.
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
