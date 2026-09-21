/**
 * BarefootJS - Comment Scope Registry
 *
 * Registry for elements that serve as scope proxies for comment-based scopes.
 * Maps an element to its comment node and the sibling range boundary.
 */

import { BF_SCOPE, BF_SCOPE_COMMENT_PREFIX, BF_SCOPE_COMMENT_END_PREFIX, BF_LOOP_ITEM, BF_LOOP_END, BF_HOST, BF_PORTAL_OWNER } from '@barefootjs/shared'

/**
 * Information about a comment-based scope.
 */
export interface CommentScopeInfo {
  commentNode: Comment
  scopeId: string
}

/**
 * Registry mapping elements to their comment scope info.
 */
export const commentScopeRegistry = new WeakMap<Element, CommentScopeInfo>()

/**
 * Get the scope ID for an element from the comment scope registry.
 * Used by createPortal to resolve scope IDs for comment-based scopes.
 */
export function getPortalScopeId(element: Element): string | null {
  const info = commentScopeRegistry.get(element)
  return info?.scopeId ?? null
}

/**
 * Find the `<!--bf-scope:ID-->` (or `bf-scope:ID|props`) comment for a
 * scope id, searching the whole document. Shared by `resolveScopeElement`
 * and `findInScope` below — both need this same lookup, then do
 * different things with the hit.
 */
function findScopeComment(scopeId: string): Comment | null {
  const prefix = BF_SCOPE_COMMENT_PREFIX + scopeId
  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT)
  let node: Comment | null
  while ((node = walker.nextNode() as Comment | null)) {
    const value = node.nodeValue ?? ''
    if (value === prefix || value.startsWith(`${prefix}|`)) return node
  }
  return null
}

/**
 * Resolve the DOM element standing in for a scope id, whether that scope
 * is element-based (`bf-s="<id>"`) or comment-based (a fragment root, or
 * a root-is-a-child-call wrapper, #2649) — the shape a `bf-h` value can
 * legally name either way.
 *
 * A comment scope has no element of its own to carry the id, so a bare
 * `[bf-s="<id>"]` lookup silently returns null for it. Every caller that
 * jumps to a `bf-h`/`bf-po` target by id (`useContext`'s DOM-ancestor
 * walk, `findSiblingSlot`) needs that case too, or it falls through to
 * an UNSCOPED, page-wide search — reintroducing exactly the cross-
 * instance-leak bug class those jumps exist to prevent (measured: a
 * ContextMenu on a reference page stacking several demo instances, each
 * `<ContextMenuBasicDemo>`-style wrapper a single child-component call
 * and therefore comment-scoped, resolved every instance's trigger to
 * the page's FIRST context-menu-trigger once bf-h lookup silently failed
 * and the caller fell back to `document.body.querySelector(...)`).
 *
 * Returns the exact element `hydrateCommentScope` (hydrate.ts) registers
 * in `commentScopeRegistry` for the comment case — the comment's own next
 * element sibling, or its parent when it has none — recomputed by the
 * same rule against the live DOM, so identity-keyed lookups against that
 * registry still hit.
 */
export function resolveScopeElement(scopeId: string): Element | null {
  const direct = document.querySelector(`[${BF_SCOPE}="${scopeId}"]`)
  if (direct) return direct

  const comment = findScopeComment(scopeId)
  return comment ? (comment.nextElementSibling ?? comment.parentElement) : null
}

/**
 * Find a descendant of a scope id matching `selector` — a PLAIN, unfiltered
 * match (self or `querySelector`), comment-scope aware.
 *
 * Deliberately NOT `find()` (query.ts): `find()`'s `candidatesInScope`/
 * `belongsToScope` exist to resolve the COMPILER's own declared slot
 * children, and reject a candidate that carries its own `bf-s` — correct
 * there (it means the candidate belongs to a nested child scope, not this
 * one's own template), but wrong for this caller's question, which is
 * just "does an element matching this selector live in this scope's
 * content, however deep, even if it's itself a separately-scoped
 * component?" (e.g. `<ContextMenuTrigger>`, itself a scoped child, living
 * beside `<ContextMenuContent>` under the same `<ContextMenu>` scope) —
 * `find()` rejects exactly that shape and silently returns null.
 *
 * The comment-scope case additionally can't stop at one element: a
 * fragment-root/root-is-a-child-call scope's content may be SEVERAL
 * top-level sibling nodes in the comment's range, not just the one
 * `resolveScopeElement` returns as a representative proxy.
 */
export function findInScope(scopeId: string, selector: string): Element | null {
  const direct = document.querySelector(`[${BF_SCOPE}="${scopeId}"]`)
  if (direct) return direct.matches(selector) ? direct : direct.querySelector(selector)

  const comment = findScopeComment(scopeId)
  if (!comment) return null

  const boundary = getCommentScopeBoundary(comment)
  let node: Node | null = comment.nextSibling
  while (node && node !== boundary) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.matches(selector)) return el
      const found = el.querySelector(selector)
      if (found) return found
    }
    node = node.nextSibling
  }
  return null
}

/**
 * Resolve the scope id a component's OWN init body should use for
 * `[bf-h="<id>"]`/`[bf-s$="_<slot>"]` child lookups (#2910).
 *
 * A comment-scoped component (a fragment root wrapped in
 * `<!--bf-scope:-->`, or a root that is itself a single child-component
 * call, #2649) is mounted on a PROXY element that also carries its own
 * `bf-s` attribute — but that attribute names the proxy's host/parent
 * scope, not this component's. Reading it as `__scopeId` makes every
 * child selector this component builds search for children stamped with
 * the WRONG id (the compiled child rows carry `bf-h="<comment scope id>"`,
 * never the proxy's `bf-s`), so none of them match and the component's
 * `.map()`-produced children silently never initialise.
 *
 * `hydrateCommentScope`, `findCommentChildScope`, and every CSR-materialize
 * path through `createComponent` (a bare top-level mount, AND a nested/
 * slotted mount via `upsertChild`/`upsertChildItem`) register the proxy in
 * `commentScopeRegistry` before running this component's init, so
 * preferring that registration over the raw attribute gives the component
 * its own id in every case; an element-scoped component (never registered
 * here) falls through to the attribute unchanged.
 */
export function ownScopeId(element: Element): string | null {
  return commentScopeRegistry.get(element)?.scopeId ?? element.getAttribute(BF_SCOPE)
}

/**
 * True if `element` sits within a comment-based scope's sibling range — the
 * comment node itself to the next `bf-scope:`/end-marker comment (or the
 * end of the parent's children). Exported for `query.ts`'s `find()`/
 * `findCondTarget()`/`commentBelongsToScope()`, which need this same check
 * against a comment they already hold, not a registered scope element —
 * `isWithinScope` below is the scope-element-keyed sibling.
 */
export function isInCommentScopeRange(element: Element, commentNode: Comment): boolean {
  const boundary = getCommentScopeBoundary(commentNode)
  let node: Node | null = commentNode.nextSibling
  while (node && node !== boundary) {
    if (node === element || (node.nodeType === Node.ELEMENT_NODE && (node as Element).contains(element))) {
      return true
    }
    node = node.nextSibling
  }
  return false
}

/**
 * True if `el` physically sits inside `scope`'s own DOM range: its subtree
 * for an element scope, or the registered comment's sibling range for a
 * comment-anchored scope. Used by `relocatedDescendants` to tell a
 * genuinely relocated element (SSR-portal outlet placement, or a
 * hydrate-time `createPortal` that already ran) apart from one that merely
 * carries `bf-h`/`bf-po` pointing at `scope` while still sitting in its
 * normal SSR position (an adapter with no portal outlet, or a client
 * portal that hasn't run yet).
 */
function isWithinScope(scope: Element, el: Element): boolean {
  if (scope === el) return true
  const info = commentScopeRegistry.get(scope)
  return info ? isInCommentScopeRange(el, info.commentNode) : scope.contains(el)
}

/**
 * The scope element a relocated element `el` logically hangs off: its
 * `bf-h` (the host it was upserted from — by the (bf-h, bf-m) slot-identity
 * invariant this is never `el` itself) when set, else a non-self `bf-po`
 * (an explicit `<Portal>` wrapper, which has no `bf-h` of its own, or a
 * self-owner-stamped component root whose `bf-po` happens to equal a TRUE
 * ancestor rather than itself — doesn't occur in any shipped shape today,
 * but the check costs nothing to keep). `null` when neither attribute
 * points anywhere but `el`.
 *
 * The ONE child-to-host hop in the runtime: `useContext` (`context.ts`)
 * calls this directly for its own DOM-ancestor walk, and
 * `relocatedDescendants` below uses it in the opposite (host-to-child)
 * direction to find its own relocated descendants. bf-h is tried before
 * bf-po (rather than the other way around) because it's the stronger
 * invariant — never self-referential by construction — so for the shape
 * that actually has both attributes (a self-owner component root, whose
 * `bf-po` IS self-referential) bf-h alone is already the right answer,
 * with no need to try `bf-po` and discover it's useless first.
 */
export function logicalHost(el: Element): Element | null {
  const own = ownScopeId(el)
  const hostId = el.getAttribute(BF_HOST)
  const ownerId = el.getAttribute(BF_PORTAL_OWNER)
  const id = hostId && hostId !== own ? hostId : ownerId && ownerId !== own ? ownerId : null
  if (!id) return null
  const host = resolveScopeElement(id)
  return host && host !== el ? host : null
}

/**
 * Elements that physically render OUTSIDE `scope`'s own DOM range but still
 * logically belong to it. The SSR-portal-outlet placement (#3059) and
 * `createPortal`'s hydrate-time relocation both move a scope's own children
 * out from under it, breaking every consumer that finds "this scope's
 * content" by walking its literal subtree — `commentsInScope`, `find`'s
 * portal fallback, `$t`, `findSsrScopeBySlotIn`. This generator is the
 * physical complement of those subtree walks: elements reachable from
 * `scope` by (bf-h, bf-po) but NOT already inside its own range. Every
 * consumer here returns on first match and only pulls from this generator
 * AFTER its own in-range search already failed, so the common,
 * non-relocated path never runs this body at all.
 *
 * Two passes:
 *  1. Direct hop — an element whose `bf-h` names `scope` outright (a
 *     self-owner-portaled child component, whose own root carries `bf-s`
 *     and therefore stamps `bf-po` to ITS OWN id, never `scope`'s — see
 *     `logicalHost`'s doc comment), or an explicit `<Portal>` wrapper
 *     (`bf-pi`, no `bf-s`) whose `bf-po` names `scope` directly.
 *  2. Transitive — only walked once the direct hop is exhausted. Covers
 *     multi-hop forwarding: a component that itself forwards `children`
 *     into a portaled grandchild (e.g. `CommandDialog` forwarding into
 *     `DialogContent`) — the candidate's own host chain (`logicalHost`,
 *     followed repeatedly) eventually lands inside `scope`. Bounded at 16
 *     hops so malformed/cyclic markup can't loop forever; every real
 *     forwarding chain in this codebase is at most two or three deep.
 *
 * Does NOT disambiguate a `scope` whose own id is shared across `.map()`
 * rows (#3115): `__bfParent` is the ENCLOSING component's own instance id,
 * computed once for the whole loop, not once per row (`hono-adapter.ts`),
 * so every row's Select/SelectContent/SelectItem-alike carries the IDENTICAL
 * (bf-h, bf-m) pair. Worse, a forwarded grandchild's `bf-h` typically names
 * the OUTERMOST authoring component (the `.map()`'s own enclosing
 * component), never an intermediate wrapper like `Select` — so this
 * scope-to-descendant graph walk, seeded from `Select`'s own scope, can
 * never even reach it (wrong host entirely, not just the wrong row). That
 * shape needs row correlation this function does not attempt; tracked in
 * #3115, not fixed here.
 */
export function* relocatedDescendants(scope: Element): Generator<Element> {
  const id = ownScopeId(scope)
  if (!id) return

  const seen = new Set<Element>()
  for (const el of document.querySelectorAll(
    `[${BF_HOST}="${id}"][${BF_PORTAL_OWNER}], [${BF_PORTAL_OWNER}="${id}"]`
  )) {
    if (isWithinScope(scope, el)) continue
    seen.add(el)
    yield el
  }

  for (const el of document.querySelectorAll(`[${BF_PORTAL_OWNER}]`)) {
    if (seen.has(el) || isWithinScope(scope, el)) continue
    let cur: Element | null = el
    for (let hops = 0; hops < 16 && cur; hops++) {
      cur = logicalHost(cur)
      if (cur && isWithinScope(scope, cur)) {
        yield el
        break
      }
    }
  }
}

/**
 * Find the end boundary for a comment-based scope.
 *
 * The boundary depends on the anchor's kind:
 *  - `bf-scope:` anchor (fragment-root component): boundary is this scope's
 *    own `bf-/scope:<scopeId>` end marker when present (#2289). Without one
 *    (SSR HTML from an adapter runtime predating the end marker), fall back
 *    to the next `bf-scope:` comment or the end of the parent's children —
 *    the historical heuristic, which over-extends the range past the
 *    fragment's real last root.
 *  - `bf-loop-i:<key>` anchor (loop item, #1665): boundary is the next
 *    loop-item anchor (`bf-loop-i:*`) or the loop end marker (`bf-/loop:*`),
 *    so one item's range never bleeds into the next item or past the loop.
 */
export function getCommentScopeBoundary(commentNode: Comment): Node | null {
  const anchorValue = commentNode.nodeValue ?? ''
  const isLoopItem = anchorValue.startsWith(`${BF_LOOP_ITEM}:`)

  // Exact end-marker value for a scope anchor: `bf-/scope:<scopeId>`. The
  // scope id is the `|`-free head of the anchor value, so a nested child
  // scope's markers (different id) never terminate this range.
  let endValue: string | null = null
  if (!isLoopItem && anchorValue.startsWith(BF_SCOPE_COMMENT_PREFIX)) {
    const rest = anchorValue.slice(BF_SCOPE_COMMENT_PREFIX.length)
    const pipeIdx = rest.indexOf('|')
    endValue = BF_SCOPE_COMMENT_END_PREFIX + (pipeIdx >= 0 ? rest.slice(0, pipeIdx) : rest)
  }

  let legacyBoundary: Node | null = null
  let node: Node | null = commentNode.nextSibling
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue ?? ''
      if (isLoopItem) {
        if (value.startsWith(`${BF_LOOP_ITEM}:`) || value.startsWith(`${BF_LOOP_END}:`)) {
          return node
        }
      } else if (endValue && value === endValue) {
        return node
      } else if (value.startsWith(BF_SCOPE_COMMENT_PREFIX)) {
        // Historically the range ended at the next scope comment. When this
        // anchor can have an end marker, keep scanning: the comment seen
        // here may belong to a nested child scope inside the range, not to
        // a sibling that terminates it.
        if (!endValue) return node
        if (!legacyBoundary) legacyBoundary = node
      }
    }
    node = node.nextSibling
  }
  return legacyBoundary // null → end of parent's children
}
