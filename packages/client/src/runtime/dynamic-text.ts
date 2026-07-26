/**
 * Dynamic text/JSX slot updater (#1663).
 *
 * Slot unification A3 (`spec/slot-unification.md` §5-A3) replaced every
 * OTHER `__bfText` call site with a claimed 'markup' slot writer
 * (`claim-slots.ts`'s `writeMarkup` provides the identical Node/text
 * contract). ONE emission site still calls `__bfText` directly and is
 * deliberately deferred: `emitDynamicTextUpdates`'s `conditionalElems`
 * path (`ir-to-client-js/emit-reactive.ts`) — a dynamic text/JSX
 * expression nested inside a top-level (non-loop) conditional, tracked by
 * an effect OUTSIDE the conditional's own `insert()` `bindEvents`. That
 * effect re-resolves its anchor via `$t(__scope, slotId)` on EVERY run
 * because `insert()` may swap the branch independently of this effect's own
 * reruns — a cached `lazySlots` claim would go stale across such a swap,
 * and a 'markup' slot's dedup/trust-first-run `last` state can't safely
 * survive being re-claimed fresh every run either (a fresh claim's `last`
 * always starts `undefined`, so re-claiming per-run would trust-first-run
 * away every write forever, never patching real changes — unlike the
 * 'text'-kind conditional cases elsewhere in the compiler, which have no
 * such state to go stale and so DO re-claim fresh each run safely). Moving
 * this one case onto the claim-plan model needs the slot's claim door tied
 * to the branch's OWN activation lifecycle instead of this separate
 * effect's — real architectural work, not a mechanical swap — so it stays
 * on `$t`/`__bfText` for now.
 *
 * The mechanism itself, for the reader who lands here from that one site:
 * the compiler wraps reactive child expressions (`<div>{expr}</div>`) in a
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
 *  through a text anchor that must survive while stale siblings are cleared).
 *  Returns whether it actually removed any node, so the profiler fingerprint
 *  (§4.2.2) can treat a stale-element cleanup as a real DOM change even when the
 *  written text is unchanged. */
function clearSlotRegion(start: Node, keep?: Node): boolean {
  let removed = false
  let n = start.nextSibling
  while (
    n &&
    !(n.nodeType === Node.COMMENT_NODE && (n as Comment).nodeValue === END_MARKER)
  ) {
    const next = n.nextSibling
    if (n !== keep) {
      n.parentNode?.removeChild(n)
      removed = true
    }
    n = next
  }
  return removed
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
    const textChanged = current.nodeValue !== text
    current.nodeValue = text
    // The conditional-slot path re-resolves the anchor via `$t()` on every
    // run, which can hand back a freshly created text node sitting *before* a
    // stale element left by a previous Node-valued run. Clear any remaining
    // siblings up to the end marker so switching JSX → text doesn't render
    // both the old element and the new text.
    const start = slotStart(current)
    const clearedStale =
      start != null && start.nodeType === Node.COMMENT_NODE && clearSlotRegion(start, current)
    // Removing a stale element is a real DOM change even when the text matched,
    // so the run isn't wasted in that case (§4.2.2).
    __bfReportOutput(textChanged || clearedStale)
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
