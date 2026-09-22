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

import { BF_SCOPE, BF_HOST, BF_AT } from '@barefootjs/shared'
import { cssEscape, findCommentChildScope } from './query.ts'
import { relocatedDescendants, ownScopeId } from './scope.ts'
import { hydratedScopes } from './hydration-state.ts'

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
  // is NOT a descendant of `parent` in the SSR markup at all — the adapter
  // places it at its portal outlet (`<BfPortals />`, a document.body-level
  // sibling of the whole page tree). The primary `parent.querySelector`
  // lookups above can never reach it, so widen to `relocatedDescendants`
  // (scope.ts) once they fail: it finds a self-owner-portaled child by its
  // `bf-h` (its `bf-po` is self-referential — the child's own root carries
  // `bf-s`, so it can never carry `bf-po="<parentBfs>"` — see
  // `logicalHost`'s doc comment for why `bf-po` alone can't find this
  // shape) and an explicit `<Portal>` wrapper by its `bf-po`, either
  // transitively through further forwarding. `(bf-h, bf-m)` stays the match
  // key — unique by construction at SSR emit time (spec/compiler.md "Slot
  // identity") — so this can't false-match a different parent's child.
  const hostEl = anchorScope ?? parent.closest(`[${BF_SCOPE}]`)
  if (hostEl) {
    // Match on the FULL (bf-h, bf-m) pair, not bf-m alone: `relocatedDescendants`'s
    // transitive pass can yield a GRANDCHILD whose own bf-h names an
    // INTERMEDIATE host, not `hostEl` itself, and compiler slot ids are
    // assigned independently per component file — a `slotId` collision
    // between `hostEl`'s own (absent-from-SSR, e.g. behind a conditional)
    // child and an unrelated forwarded grandchild is expected, not a
    // corner case. A bf-m-only match would silently hand `hostEl` a
    // grandchild that was never its own declared child.
    //
    // Compared against `ownScopeId(hostEl)`, not the raw `parentBfs`
    // attribute: for a comment-scoped host (#2910), `hostEl`'s own bf-s
    // attribute names ITS parent, not itself — `ownScopeId` is the same
    // registry-preferring resolution `relocatedDescendants` already used
    // internally to find these candidates in the first place, so the two
    // must agree for the match to be reachable at all.
    //
    // Search each relocated candidate SELF *and* its own subtree, not the
    // candidate alone: `relocatedDescendants` only yields elements that
    // are THEMSELVES portal-owned (carry `bf-po`) — a target that is
    // instead a plain forwarded descendant of one of those (e.g. a
    // `SelectItem`, itself never `bf-po`-stamped, physically nested inside
    // a relocated `SelectContent`) never appears in that generator at all,
    // so a self-only check can never find it: `findSsrScopeBySlotIn`
    // returned `null` for every `SelectItem` in a portaled `<Select>`,
    // `upsertChild` fell through to its placeholder branch (no SSR-side
    // `data-bf-ph` to adopt), and the item's own `init()` never ran —
    // no console warning, no error, just a click handler that was never
    // attached (measured: #3059's SSR-portal placement broke every
    // `<Select>`'s items this way, looped row or not — `query.ts`'s
    // `findInPortals` already does the same self-or-descend search for
    // exactly this reason, for the `$c`/`$t`/`$()` paths it serves).
    //
    // Skip an already-hydrated match: a component instantiated once per
    // `.map()` loop row (a Select rendered inside a heterogeneous field
    // list, say) shares the exact same (bf-h, bf-m) pair across every row
    // — that pair addresses a JSX POSITION, not a physical instance, and
    // is only unique for a non-looped child. Before #3059, a row's own
    // copy was still reachable because this search never ran: a looped
    // child's SSR markup stayed nested in ITS OWN row, so the primary
    // subtree-scoped lookups above already found it. Once #3059 moves a
    // looped child's markup to the shared outlet, every row's copy
    // collapses into IDENTICAL siblings, and returning the first match
    // for every row (a) never advances any row past row 0's, and (b)
    // hands `initChild` (registry.ts) a scope its `hydratedScopes` guard
    // then silently no-ops on for every row after the first — rows 1+
    // never get their OWN `init()` call at all. Skipping an
    // already-claimed candidate and returning the NEXT one instead mirrors
    // `findScope`'s existing `!hydratedScopes.has(s)` filter for the
    // same-named-top-level-instances case (query.ts) — it works here for
    // the identical reason: hydration walks rows in the same left-to-right
    // document order `<BfPortals />` collected them in (SSR renders a
    // `.map()` synchronously in array order), so the Nth still-unclaimed
    // match is always this row's own. The same skip disambiguates a
    // SLOT NESTED inside a relocated candidate too — a looped `Select`'s
    // `SelectItem` copies are found one relocated `SelectContent` at a
    // time, in the same document order, so the Nth still-unclaimed nested
    // match is likewise always this row's own.
    const hostId = ownScopeId(hostEl)
    if (hostId) {
      const relocatedSelector = `[${BF_HOST}="${cssEscape(hostId)}"][${BF_AT}="${slotId}"]`
      for (const rel of relocatedDescendants(hostEl)) {
        if (rel.matches(relocatedSelector) && !hydratedScopes.has(rel)) {
          return rel as HTMLElement
        }
        for (const el of rel.querySelectorAll(relocatedSelector)) {
          if (!hydratedScopes.has(el)) return el as HTMLElement
        }
      }
    }
  }

  // Fragment-root child: its scope is a bf-scope: comment, not an element
  // carrying (bf-h, bf-m) — resolve the comment's proxy element (#2289).
  return findCommentChildScope(
    parent,
    parentBfs ? [parentBfs] : [],
    slotId,
  ) as HTMLElement | null
}
