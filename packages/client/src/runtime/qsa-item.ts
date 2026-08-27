/**
 * Multi-root-aware slot lookup + child upsert for `mapArray` items whose
 * body is a JSX Fragment with two or more sibling elements (#1212).
 *
 * In a single-root loop, every reactive slot inside a renderItem body is a
 * descendant of `__el`, so plain `qsa(__el, ...)` finds it. With a
 * multi-root Fragment item the second / third / Nth root are *siblings* of
 * `__el` rather than descendants — `__el.querySelector(...)` will silently
 * miss them, leaving reactive attributes / event handlers unbound, and
 * `upsertChild(__el, ...)` will fail to find child component scope
 * elements that live on a sibling root.
 *
 * The compiler emits `qsaItem` / `upsertChildItem` for these cases. Both
 * iterate the same set of "item root elements":
 *
 *   1. The primary element itself.
 *   2. Sibling roots that follow it in the DOM, until a loop boundary
 *      Comment is reached (`<!--bf-loop-i-->`, `<!--bf-loop:*-->`,
 *      `<!--bf-/loop:*-->`). These bound the item's range so a lookup
 *      cannot escape into a neighbouring item or into nodes outside the
 *      loop.
 *   3. The CSR-only `__bfExtras` stash. During renderItem-body setup
 *      (between the template clone and the function's return), the extras
 *      are not siblings yet. Reading `__bfExtras` lets lookups reach them
 *      before `mapArray` inserts them into the DOM.
 *
 * Step 3 must stay reachable whether or not the primary is attached, which
 * is why step 2 ends its walk with `break` rather than `return`. Only the
 * sibling walk is bounded; ending the generator there would skip the stash.
 *
 * This used to be a `return`, and the difference was invisible: with a
 * detached primary `nextSibling` is `null`, so the walk never runs and
 * control reaches the stash regardless. Attaching the primary made the very
 * first sibling a boundary comment, which ended the generator before the
 * stash was consulted and left the item's child placeholders unreplaced.
 * Measured, not deduced — and note this is NOT the failure the earlier
 * comment here described: the walk never ran past the item into a
 * neighbouring one, it stopped correctly and then gave up too early.
 */

import { BF_LOOP_ITEM, BF_LOOP_START, BF_LOOP_END } from '@barefootjs/shared'
import { initChild } from './registry.ts'
import { createComponent } from './component.ts'
import { findSsrScopeBySlotIn, buildSlotInfo } from './slot-resolver.ts'

/** Iterate the elements that belong to an item — primary, in-tree siblings within bounds, then any pre-insertion extras stash. */
function* itemRootElements(primaryEl: Element): Iterable<Element> {
  yield primaryEl
  const startPrefix = `${BF_LOOP_START}:`
  const endPrefix = `${BF_LOOP_END}:`
  let n: Node | null = primaryEl.nextSibling
  while (n) {
    if (n.nodeType === Node.COMMENT_NODE) {
      const v = (n as Comment).nodeValue ?? ''
      // Hard stops: another item starts, or the loop range ends. The
      // BF_LOOP_START check defends against a sibling loop block whose
      // start marker happens to follow ours.
      // `break`, not `return`: stop the SIBLING walk, but still fall through
      // to the `__bfExtras` stash below. A `return` ends the generator, and
      // the stash is the only way to reach extras that are not siblings yet.
      // That difference is invisible while the primary is detached — then
      // `nextSibling` is `null`, this loop never runs, and control reaches the
      // stash anyway — and decides the outcome the moment it is attached.
      if (v === BF_LOOP_ITEM
          || v === BF_LOOP_START || v.startsWith(startPrefix)
          || v === BF_LOOP_END || v.startsWith(endPrefix)) {
        break
      }
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      yield n as Element
    }
    n = n.nextSibling
  }
  // CSR pre-insertion path: extras are not yet siblings in the DOM, but
  // the compiler stashed them on the primary so the renderItem body can
  // still reach them during setup.
  const stashed = (primaryEl as unknown as { __bfExtras?: HTMLElement[] }).__bfExtras
  if (stashed) {
    for (const ex of stashed) yield ex
  }
}

/**
 * Find an element matching `selector` within an item's range. Searches
 * the primary's descendants first, then walks each root in
 * `itemRootElements`, returning the first match.
 */
export function qsaItem(primaryEl: Element | null, selector: string): Element | null {
  if (!primaryEl) return null
  for (const root of itemRootElements(primaryEl)) {
    if (root.matches(selector)) return root
    const inner = root.querySelector(selector)
    if (inner) return inner
  }
  return null
}

/**
 * Multi-root-aware variant of `upsertChild`. Looks for the SSR scope
 * element (or CSR placeholder) anywhere within the item's range —
 * descendants of the primary root, sibling Fragment roots in the DOM,
 * or the pre-insertion `__bfExtras` stash — so a child component
 * carried by any root of a multi-root loop body is initialised
 * correctly (#1212).
 *
 * Uses `qsaItem`-style search (root-or-descendant per element) so it
 * also matches when a sibling root *is* the component scope element
 * itself, not just a parent of it.
 *
 * Mirrors `upsertChild`'s #1220 collision skip: slotId-suffix candidates
 * with a deeper `_sN_sN` shape (a synthesized child's nested scope path)
 * are ignored so `initChild` doesn't fire on the wrong element.
 */
export function upsertChildItem(
  primaryEl: Element,
  name: string,
  slotId: string | null,
  props: Record<string, unknown>,
  key?: string | number,
  anchorScope?: Element | null,
): HTMLElement | null {
  let ssr: HTMLElement | null = null
  if (slotId) {
    for (const root of itemRootElements(primaryEl)) {
      const found = findSsrScopeBySlotIn(root, slotId, anchorScope, /* selfMatch */ true)
      if (found) { ssr = found; break }
    }
  } else {
    ssr = qsaItem(primaryEl, `[bf-s^="${name}_"]`) as HTMLElement | null
  }
  if (ssr) {
    initChild(name, ssr, props)
    return ssr
  }
  // CSR: replace placeholder with a freshly-created component.
  const phId = slotId ?? name
  const ph = qsaItem(primaryEl, `[data-bf-ph="${phId}"]`) as HTMLElement | null
  if (ph) {
    const slot = slotId ? buildSlotInfo(primaryEl, slotId, anchorScope) : undefined
    // Connect before init — see the same call in `upsertChild`. `mountAt`
    // (`ph`) is always given here, so `createComponent` never returns the
    // bare-fragment-root `DocumentFragment` shape (see its docstring) —
    // this call always gets back the real element.
    return createComponent(name, props, key, slot, ph) as HTMLElement
  }
  return null
}
