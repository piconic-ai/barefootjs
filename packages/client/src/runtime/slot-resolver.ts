/**
 * Shared slot-relationship resolver — identifies the SSR scope of a child
 * component mounted at slot `<sN>` inside its parent component, using the
 * `bf-h` / `bf-m` markers as the sole lookup. Per #1249, both the legacy
 * bf-s suffix scan and the bf-s name-prefix scan are removed: identity is
 * `(bf-h, bf-m)`, unique by construction.
 *
 * Both single-root (`registry.ts::upsertChild`) and multi-root loop-body
 * (`qsa-item.ts::upsertChildItem`) paths consume this. They differ only
 * in whether they search a single `parent` element or walk a sequence of
 * loop-item root elements; the actual lookup logic is identical.
 */

import { BF_SCOPE, BF_HOST, BF_AT } from '@barefootjs/shared'

/** Resolve the parent component scope id for a slot lookup. Prefers the
 *  explicit `anchorScope` because the immediate `parent` element may be a
 *  freshly-created detached fragment whose `closest()` returns null.
 *
 *  Per #1249 the `bf-s` value no longer carries a child prefix — the value
 *  IS the scope id, so it can be used as-is for `bf-h` lookups. */
export function parentScopeOf(parent: Element, anchorScope?: Element | null): string {
  const ancestor = anchorScope ?? parent.closest(`[${BF_SCOPE}]`)
  if (!ancestor) return ''
  return ancestor.getAttribute(BF_SCOPE) ?? ''
}

/** Build the bf-h / bf-m metadata for a fresh component about to be
 *  mounted at `slotId`. `createComponent` stamps these onto the new
 *  element so subsequent `upsertChild` lookups can find it via the
 *  slot-relationship markers.
 *
 *  Per #1249 AC: bf-m must be set on every CSR child mount so the
 *  `isClaimedForOtherSlot` filter cannot be a no-op. `parent` defaults
 *  to the empty string when no surrounding scope is resolvable
 *  (top-level CSR mount) — `createComponent` then stamps bf-m but
 *  omits bf-h, which is still enough for the filter to function. */
export function buildSlotInfo(
  parent: Element,
  slotId: string,
  anchorScope?: Element | null,
): { parent: string; mount: string } {
  return { parent: parentScopeOf(parent, anchorScope), mount: slotId }
}

/**
 * Find the SSR scope element for a child component at `slotId` inside
 * `parent`. The lookup is a single primary query on `(bf-h, bf-m)` — the
 * authoritative identity of a slot-attached child scope.
 *
 *   1. Resolve the host bf-s value via `parentScopeOf` (or use
 *      `anchorScope` directly).
 *   2. Search `parent` for an element whose `bf-h` and `bf-m` both match.
 *      There can be at most one such direct child for a given (host, slot)
 *      pair (unique by construction), so we return immediately.
 *
 * No suffix or name-prefix fallback. SSR templates and CSR mounts both
 * stamp the (bf-h, bf-m) pair (#1249); anything missing them isn't a
 * slot-attached child and shouldn't be matched here.
 *
 * The `selfMatch` option lets the multi-root loop-body caller include
 * the root element itself in the search (the loop-item primary may be
 * the scope element, not just a parent of it).
 *
 * `_name` is unused in the new lookup but kept on the signature so call
 * sites needn't change in lockstep with this internal simplification.
 */
export function findSsrScopeBySlotIn(
  parent: Element,
  _name: string,
  slotId: string,
  anchorScope: Element | null | undefined,
  selfMatch: boolean,
): HTMLElement | null {
  const parentBfs = parentScopeOf(parent, anchorScope)

  // Primary lookup via slot-relationship markers (#1249).
  if (parentBfs) {
    const escaped = (CSS as { escape?: (s: string) => string }).escape
      ? CSS.escape(parentBfs)
      : parentBfs.replace(/"/g, '\\"')
    const selector = `[${BF_HOST}="${escaped}"][${BF_AT}="${slotId}"]`
    if (selfMatch && parent.matches(selector)) return parent as HTMLElement
    const direct = parent.querySelector(selector) as HTMLElement | null
    if (direct) return direct
  }

  // Loop-body fallback: inside a mapArray reconcile, `renderChild` runs
  // outside any `setParentScopeId` context (mapArray doesn't propagate
  // host through its renderItem callback yet — follow-up). Those elements
  // therefore lack bf-h / bf-m even though their bf-s value still ends
  // in `_<slotId>`. We accept the suffix lookup as a fallback ONLY for
  // elements that have NO bf-h, so it can't reclaim a sibling slot's
  // already-bound child. The legacy bf-s name-prefix scan is intentionally
  // gone — that was the source of #1249's cross-scope collision.
  const suffixSelector = `[${BF_SCOPE}$="_${slotId}"]:not([${BF_HOST}])`
  if (selfMatch && parent.matches(suffixSelector)) return parent as HTMLElement
  return parent.querySelector(suffixSelector) as HTMLElement | null
}
