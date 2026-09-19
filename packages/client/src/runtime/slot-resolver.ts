/**
 * Shared slot-relationship resolver: identifies the SSR scope of a child
 * component mounted at slot `<sN>` inside its parent.
 *
 * Both single-root (`registry.ts::upsertChild`) and multi-root loop-body
 * (`qsa-item.ts::upsertChildItem`) paths consume this. They differ only
 * in whether they search a single `parent` element or walk a sequence of
 * loop-item root elements; the lookup logic is identical.
 *
 * See `spec/compiler.md` "Slot identity" for the marker contract.
 */

import { BF_SCOPE, BF_HOST, BF_AT, BF_PORTAL_OWNER } from '@barefootjs/shared'
import { cssEscape, findCommentChildScope } from './query.ts'

/** Resolve the host scope id for a slot lookup. Prefers the explicit
 *  `anchorScope` because the immediate `parent` element may be a freshly-
 *  created detached fragment whose `closest()` returns null. */
export function parentScopeOf(parent: Element, anchorScope?: Element | null): string {
  const ancestor = anchorScope ?? parent.closest(`[${BF_SCOPE}]`)
  if (!ancestor) return ''
  return ancestor.getAttribute(BF_SCOPE) ?? ''
}

/** Build the (host, slot) metadata for a fresh component about to be
 *  mounted at `slotId`. `createComponent` stamps these onto the new
 *  element so subsequent `upsertChild` lookups can find it. `parent`
 *  defaults to the empty string when no surrounding scope is resolvable
 *  (top-level CSR mount). */
export function buildSlotInfo(
  parent: Element,
  slotId: string,
  anchorScope?: Element | null,
): { parent: string; mount: string } {
  return { parent: parentScopeOf(parent, anchorScope), mount: slotId }
}

/**
 * Find the SSR scope element for a child component at `slotId` inside
 * `parent`. Primary lookup is `(BF_HOST, BF_AT)`; the suffix fallback
 * covers `renderChild` paths that emit a parent-anchored `bf-s` without
 * stamping host metadata.
 *
 * `selfMatch` lets the multi-root loop-body caller include the root
 * element itself in the search (the loop-item primary may be the scope
 * element, not just a parent of it).
 */
export function findSsrScopeBySlotIn(
  parent: Element,
  slotId: string,
  anchorScope: Element | null | undefined,
  selfMatch: boolean,
): HTMLElement | null {
  const parentBfs = parentScopeOf(parent, anchorScope)

  if (parentBfs) {
    const selector = `[${BF_HOST}="${cssEscape(parentBfs)}"][${BF_AT}="${slotId}"]`
    if (selfMatch && parent.matches(selector)) return parent as HTMLElement
    const direct = parent.querySelector(selector) as HTMLElement | null
    if (direct) return direct
  }

  const suffixSelector = `[${BF_SCOPE}$="_${slotId}"]`
  if (selfMatch && parent.matches(suffixSelector)) return parent as HTMLElement
  const bySuffix = parent.querySelector(suffixSelector) as HTMLElement | null
  if (bySuffix) return bySuffix

  // SSR-portal fallback (#3059): a child whose own root the compiler
  // recognized as an SSR-portal ref-callback target (`ssrPortalOwnerScope`)
  // is NOT a descendant of `parent` in the SSR markup at all — the
  // adapter places it at its portal outlet (`<BfPortals />`, a
  // document.body-level sibling of the whole page tree), stamping `bf-po`
  // directly on the element alongside its normal (bf-h, bf-m) pair (see
  // `HonoAdapter.renderElement`'s `ssrPortalOwnerScope` branch). The
  // primary `parent.querySelector` lookup above can never reach it, so
  // once that fails, widen the SAME (bf-h, bf-m) selector to a document-
  // wide search scoped to this parent's own portal-owned elements — (bf-h,
  // bf-m) is unique by construction at SSR emit time (spec/compiler.md
  // "Slot identity"), so this can't false-match a different parent's
  // child even though the search is no longer subtree-local.
  if (parentBfs) {
    const portalSelector = `[${BF_PORTAL_OWNER}="${cssEscape(parentBfs)}"][${BF_HOST}="${cssEscape(parentBfs)}"][${BF_AT}="${slotId}"]`
    const portaled = document.querySelector(portalSelector) as HTMLElement | null
    if (portaled) return portaled
  }

  // Fragment-root child: its scope is a bf-scope: comment, not an element
  // carrying (bf-h, bf-m) — resolve the comment's proxy element (#2289).
  return findCommentChildScope(
    parent,
    parentBfs ? [parentBfs] : [],
    slotId,
  ) as HTMLElement | null
}
