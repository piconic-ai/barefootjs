/**
 * Shared slot-relationship resolver — identifies the SSR scope of a child
 * component mounted at slot `<sN>` inside its parent component, using the
 * `bf-parent` / `bf-mount` markers (preferred) and falling back to the
 * legacy `bf-s` suffix lookup for SSR output produced before the markers
 * were introduced.
 *
 * Both single-root (`registry.ts::upsertChild`) and multi-root loop-body
 * (`qsa-item.ts::upsertChildItem`) paths consume this. They differ only
 * in whether they search a single `parent` element or walk a sequence of
 * loop-item root elements; the actual lookup logic is identical.
 */

import { BF_SCOPE, BF_CHILD_PREFIX, BF_PARENT, BF_MOUNT } from '@barefootjs/shared'

/** Recognises bf-s values whose final segment is a nested-slot path
 *  (`…_sM_sN`). These show up when a synthesized component (e.g.
 *  `BFInlineJsxCallback`) renders descendants whose own internal scope
 *  happens to end in `_sN`, coincidentally matching a sibling slot's
 *  loose suffix selector. The bf-s legacy fallback skips them so the
 *  wrong `initChild` never fires (#1220). */
const NESTED_SLOT_SUFFIX = /_s\d+_s\d+$/

/** A candidate element is "claimed for a different slot" when it already
 *  carries a `bf-mount` attribute that doesn't match the slot we're
 *  looking for. That can only happen when a previous `upsertChild` in
 *  the SAME parent has CSR-replaced a sibling placeholder and stamped
 *  the new component's metadata onto it. Without this filter the
 *  legacy fallbacks (suffix + name-prefix) happily return the
 *  already-mounted sibling and `initChild` fires on the wrong element,
 *  leaving the actual `data-bf-ph` placeholder for `slotId` orphaned.
 *  Surfaces when a `.map()` inserts a fresh item whose body holds
 *  multiple child components of the same name (#135 board demo:
 *  delete-task + move-left + move-right Buttons inside one task card). */
function isClaimedForOtherSlot(candidate: Element, slotId: string): boolean {
  const mount = candidate.getAttribute(BF_MOUNT)
  return mount !== null && mount !== slotId
}

/** Resolve the parent component scope id (without the `~` child prefix)
 *  for a slot lookup. Prefers the explicit `anchorScope` because the
 *  immediate `parent` element may be a freshly-created detached fragment
 *  whose `closest()` returns null. */
export function parentScopeOf(parent: Element, anchorScope?: Element | null): string {
  const ancestor = anchorScope ?? parent.closest(`[${BF_SCOPE}]`)
  if (!ancestor) return ''
  const bfs = ancestor.getAttribute(BF_SCOPE) ?? ''
  return bfs.startsWith(BF_CHILD_PREFIX) ? bfs.slice(1) : bfs
}

/** Build the bf-parent / bf-mount metadata for a fresh component about to
 *  be mounted at `slotId`. `createComponent` stamps these onto the new
 *  element so subsequent `upsertChild` lookups can find it via the
 *  slot-relationship markers. Returns `undefined` when no parent scope
 *  is resolvable (e.g. top-level CSR mount with no surrounding scope). */
export function buildSlotInfo(
  parent: Element,
  slotId: string,
  anchorScope?: Element | null,
): { parent: string; mount: string } | undefined {
  const parentBfs = parentScopeOf(parent, anchorScope)
  if (!parentBfs) return undefined
  return { parent: parentBfs, mount: slotId }
}

/**
 * Find the SSR scope element for a child component at `slotId` inside
 * `parent`, using `bf-parent` / `bf-mount` markers as the primary lookup.
 *
 * Strategy:
 *   1. Walk up from `parent` (or use `anchorScope` directly) to derive the
 *      parent component's bf-s value (without the `~` child prefix).
 *   2. Search `parent` for a descendant whose `bf-parent` and `bf-mount`
 *      both match. There can be at most one such direct child for a given
 *      (parent scope, slot) pair, so this returns immediately on first
 *      match.
 *
 * Two fallbacks remain for SSR output predating the new markers:
 *   - `[bf-s$="_<slotId>"]` + `NESTED_SLOT_SUFFIX` filter (the legacy
 *     suffix lookup that can't disambiguate recursive descendants).
 *   - `[bf-s^="~?<name>_"]` component-name prefix scan.
 *
 * The `selfMatch` option lets the multi-root loop-body caller include
 * the root element itself in the search (the loop-item primary may be
 * the scope element, not just a parent of it).
 */
export function findSsrScopeBySlotIn(
  parent: Element,
  name: string,
  slotId: string,
  anchorScope: Element | null | undefined,
  selfMatch: boolean,
): HTMLElement | null {
  const parentBfs = parentScopeOf(parent, anchorScope)

  // Primary lookup via slot-relationship markers.
  if (parentBfs) {
    const escaped = (CSS as { escape?: (s: string) => string }).escape
      ? CSS.escape(parentBfs)
      : parentBfs.replace(/"/g, '\\"')
    const selector = `[${BF_PARENT}="${escaped}"][${BF_MOUNT}="${slotId}"]`
    if (selfMatch && parent.matches(selector)) return parent as HTMLElement
    const direct = parent.querySelector(selector) as HTMLElement | null
    if (direct) return direct
  }

  // Legacy fallback: bf-s suffix lookup with #1220 nested-slot filter.
  const suffixSelector = `[${BF_SCOPE}$="_${slotId}"]`
  const candidates = selfMatch && parent.matches(suffixSelector)
    ? [parent, ...Array.from(parent.querySelectorAll(suffixSelector))]
    : Array.from(parent.querySelectorAll(suffixSelector))
  for (const candidate of candidates) {
    const bfs = candidate.getAttribute(BF_SCOPE) || ''
    if (NESTED_SLOT_SUFFIX.test(bfs)) continue
    if (isClaimedForOtherSlot(candidate, slotId)) continue
    return candidate as HTMLElement
  }

  // Last-resort fallback: component-name prefix search.
  const namePrefixSelector = `[${BF_SCOPE}^="~${name}_"], [${BF_SCOPE}^="${name}_"]`
  if (selfMatch && parent.matches(namePrefixSelector) && !isClaimedForOtherSlot(parent, slotId)) {
    return parent as HTMLElement
  }
  const prefixMatches = Array.from(parent.querySelectorAll(namePrefixSelector))
  for (const candidate of prefixMatches) {
    if (isClaimedForOtherSlot(candidate, slotId)) continue
    return candidate as HTMLElement
  }
  return null
}
