/**
 * BarefootJS - DOM Query Helpers
 *
 * Scope-aware DOM query utilities for compiler-generated ClientJS.
 * These helpers find elements within component scopes, respecting
 * nested scope boundaries and comment-based scopes.
 */

import { commentScopeRegistry, getCommentScopeBoundary } from './scope.ts'
import { hydratedScopes } from './hydration-state.ts'
import { BF_SCOPE, BF_SLOT, BF_PORTAL_OWNER, BF_PARENT_OWNED_PREFIX, BF_SCOPE_COMMENT_PREFIX, BF_SCOPE_COMMENT_END_PREFIX } from '@barefootjs/shared'

/** CSS attribute-value escape with a fallback for environments lacking CSS.escape. */
export const cssEscape: (s: string) => string =
  typeof CSS !== 'undefined' && (CSS as { escape?: (s: string) => string }).escape
    ? (s) => CSS.escape(s)
    : (s) => s.replace(/"/g, '\\"')

// --- helpers ---

/** Read bf-s attribute. Returns null when absent.
 *  Per #1249, bf-s is the bare addressable id — no stripping needed. */
function getScopeId(el: Element | null): string | null {
  return el?.getAttribute(BF_SCOPE) ?? null
}

/** Comments already processed by findScopeByComment. */
const initializedComments = new WeakSet<Comment>()

/**
 * Parse scope ID from a comment value like "bf-scope:Name_xxx|propsJson".
 * Strips the prefix and props JSON suffix.
 */
function parseCommentScopeId(value: string, prefix: string): string | null {
  if (!value.startsWith(prefix)) return null
  let id = value.slice(prefix.length)
  const pipeIdx = id.indexOf('|')
  if (pipeIdx >= 0) id = id.slice(0, pipeIdx)
  return id
}

/** Find the first Element sibling after a node. */
function nextElementSibling(node: Node): Element | null {
  let sibling: Node | null = node.nextSibling
  while (sibling) {
    if (sibling.nodeType === Node.ELEMENT_NODE) return sibling as Element
    sibling = sibling.nextSibling
  }
  return null
}

// --- findScope ---

/**
 * Find component scope element for hydration.
 * Supports unique instance IDs (e.g., ComponentName_abc123).
 *
 * @param name - Component name prefix to search for
 * @param idx - Instance index (for multiple instances)
 * @param parent - Parent element or scope element to search within
 * @param comment - When true, fall back to comment-based scope search (fragment roots only)
 * @returns The scope element or null if not found
 */
export function findScope(
  name: string,
  idx: number,
  parent: Element | Document | null,
  comment?: boolean
): Element | null {
  const parentEl = parent as HTMLElement

  // Check comment scope registry first.
  // For fragment root components, the scope is identified by a comment marker,
  // not by the bf-s attribute on the proxy element.
  // This must be checked before the bf-s check to prevent the proxy element
  // from being incorrectly accepted and marked as hydrated,
  // which would block child component initialization via initChild.
  if (parentEl) {
    const commentInfo = commentScopeRegistry.get(parentEl)
    if (commentInfo && commentInfo.scopeId.startsWith(`${name}_`)) {
      return parentEl
    }
  }

  // Check if parent is the scope element itself.
  // Two cases:
  // 1. Scope ID starts with component name (e.g., "AddTodoForm_abc123")
  // 2. Scope ID is from parent component via initChild (e.g., "TodoApp_xyz_s5")
  //    — initChild already found the correct element, so trust it
  const scopeId = getScopeId(parentEl)
  if (scopeId) {
    if (
      scopeId.startsWith(`${name}_`) ||
      (/_s\d/.test(scopeId) && parent !== document)
    ) {
      hydratedScopes.add(parentEl)
      return parent as Element
    }
  }

  // Search for scope elements with prefix matching
  const searchRoot = parent || document
  const allScopes = Array.from(
    searchRoot.querySelectorAll(`[${BF_SCOPE}^="${name}_"]`)
  )
  const uninitializedScopes = allScopes.filter(
    s => !hydratedScopes.has(s)
  )
  const scope = uninitializedScopes[idx] || null

  if (scope) {
    hydratedScopes.add(scope)
    return scope
  }

  // Only fall back to comment-based search when explicitly flagged (fragment roots)
  if (comment) {
    return findScopeByComment(name, idx, searchRoot)
  }
  return null
}

/**
 * Find a scope element by walking comment nodes for bf-scope: markers.
 * Returns the first element sibling after the comment (or parent element).
 */
function findScopeByComment(
  name: string,
  idx: number,
  searchRoot: Element | Document
): Element | null {
  const prefix = BF_SCOPE_COMMENT_PREFIX
  const walker = document.createTreeWalker(
    searchRoot,
    NodeFilter.SHOW_COMMENT
  )
  let matchIdx = 0

  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment
    const value = comment.nodeValue
    if (!value?.startsWith(prefix)) continue

    const scopeId = parseCommentScopeId(value, prefix)
    if (!scopeId?.startsWith(`${name}_`)) continue
    if (initializedComments.has(comment)) continue

    if (matchIdx === idx) {
      initializedComments.add(comment)

      // Proxy element: first element sibling after the comment, or parent
      const proxyEl = nextElementSibling(comment) ?? comment.parentElement
      if (proxyEl) {
        commentScopeRegistry.set(proxyEl, { commentNode: comment, scopeId })
      }
      return proxyEl
    }
    matchIdx++
  }

  return null
}

// --- candidate enumeration ---

/**
 * Lazily enumerate DOM elements matching `selector` within a scope's DOM range.
 * Covers comment-range siblings (for fragment roots), regular descendants,
 * and fragment siblings. Portals are searched separately via findInPortals.
 *
 * This generator separates "where to search" from "how to filter",
 * allowing find() and findDirectChild() to share enumeration logic
 * while applying different acceptance criteria.
 */
function* candidatesInScope(scope: Element, selector: string): Generator<Element> {
  const commentInfo = commentScopeRegistry.get(scope)

  if (commentInfo) {
    // Comment-based scope: walk siblings in the comment range
    const boundary = getCommentScopeBoundary(commentInfo.commentNode)
    let node: Node | null = commentInfo.commentNode.nextSibling
    while (node && node !== boundary) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element
        if (el.matches?.(selector)) yield el
        yield* el.querySelectorAll(selector)
      }
      node = node.nextSibling
    }
    return
  }

  // Regular scope: descendants then fragment siblings
  yield* scope.querySelectorAll(selector)

  const scopeId = scope.getAttribute(BF_SCOPE)
  if (!scopeId) return
  const parent = scope.parentElement
  if (!parent) return
  const siblings = parent.querySelectorAll(`[${BF_SCOPE}="${scopeId}"]`)
  for (const sibling of siblings) {
    if (sibling === scope) continue
    if (sibling.matches?.(selector)) yield sibling
    yield* sibling.querySelectorAll(selector)
  }
}

// --- scope membership ---

/**
 * Check if a slot element belongs directly to a scope (not in a nested scope).
 * Returns true only if the element's nearest scope is exactly the given scope.
 * Elements inside nested child scopes (which have their own bf-s) return false.
 *
 * Only used for slot element searches (bf="sN" selectors) in regular scopes.
 * Child scope searches ($c) use findChildScope() which bypasses this check.
 * Comment scope filtering is handled inline in find().
 */
function belongsToScope(element: Element, scope: Element): boolean {
  // Elements with their own scope are component roots — never a slot match
  if (element.getAttribute(BF_SCOPE)) return false

  // Check if nearest scope matches
  const nearestScope = element.closest(`[${BF_SCOPE}]`)
  if (nearestScope !== scope) return false

  // A fragment-rooted child mounted between `element` and `scope` has no
  // `bf-s` element of its own (#2302) — `closest()` walks straight past it
  // to `scope`, so a slot search on `scope` can wrongly claim a descendant
  // that actually belongs to that nested child's comment scope. Reject it.
  return !isInsideNestedCommentScope(element, scope)
}

/**
 * True if some ancestor of `element` (strictly below `scope`) is a
 * top-level node of a fragment-rooted child's `<!--bf-scope:...-->` range —
 * i.e. `element` structurally belongs to a nested child component even
 * though that child has no `bf-s`-attributed element for `.closest()` to
 * stop at, and regardless of whether `commentScopeRegistry` has registered
 * it yet (a parent's own slot lookups can run before its child-scope
 * lookups register the child, #2302).
 */
function isInsideNestedCommentScope(element: Element, scope: Element): boolean {
  let current: Node = element
  while (current !== scope) {
    const parent: Node | null = current.parentNode
    if (!parent) return false
    if (isTopLevelCommentScopeNode(current)) return true
    current = parent
  }
  return false
}

/**
 * True if `element` sits inside a nested child component's own scope
 * boundary somewhere on the path up to `root` — a plain `[bf-s]` element
 * (a regular child component's root) or a fragment-rooted child's
 * comment-scope range mounted as a sibling along that path.
 *
 * Generalizes `isInsideNestedCommentScope` (which only catches the
 * comment-scope case) to also catch plain `bf-s` boundaries, for `qsa()`
 * — the loose, unfiltered sibling of `find()`'s `belongsToScope`-gated
 * search. Unlike `belongsToScope`, this walks up to `root` by object
 * identity rather than requiring `root` itself to carry `bf-s`: `qsa()`'s
 * roots include `insert()`'s whole-component branch scope (which does
 * carry `bf-s`) but also loop-item template clones (which normally don't),
 * so a `.closest('[bf-s]') === root` check can't be reused here.
 *
 * Without this, a slot number that happens to collide between a component
 * and a nested child mounted earlier in its DOM (compiler slot IDs are
 * assigned independently per component file, so collisions are expected)
 * makes `qsa()` return the child's element instead of the component's own.
 *
 * Deliberately does NOT reject `element` itself for carrying `bf-s`
 * (unlike `belongsToScope`'s own-scope check) — `qsa()` doubles as the
 * lookup for a nested child component's *own* scope root (e.g. compiled
 * `qsa(parentScope, '[bf-h="X"][bf-m="sN"], [bf-s$="_sN"]')` calls feeding
 * `initChild()`), and that target legitimately carries `bf-s`. Only an
 * *intermediate* `bf-s` between `element` and `root` — i.e. `element`
 * nested inside some other, unrelated child scope — disqualifies it.
 */
function isInsideNestedChildScope(element: Element, root: Element): boolean {
  let current: Node = element
  while (current !== root) {
    const parent: Node | null = current.parentNode
    if (!parent) return false
    if (parent !== root && parent.nodeType === Node.ELEMENT_NODE && (parent as Element).hasAttribute(BF_SCOPE)) {
      return true
    }
    if (isTopLevelCommentScopeNode(current)) return true
    current = parent
  }
  return false
}

/**
 * True if `node` falls inside a `<!--bf-scope:...-->` … `<!--bf-/scope:...-->`
 * range among its own siblings — i.e. `node` is (or is inside) a top-level
 * element of a fragment-rooted child mounted as `node`'s sibling. Single
 * left-to-right pass over the sibling list with a nesting depth counter, so
 * a nested child's own begin/end pair doesn't prematurely close an outer
 * one. Missing end markers (older SSR output) leave depth un-decremented,
 * matching `getCommentScopeBoundary`'s legacy end-of-parent fallback.
 */
function isTopLevelCommentScopeNode(node: Node): boolean {
  const parent = node.parentNode
  if (!parent) return false
  let depth = 0
  let sib: Node | null = parent.firstChild
  while (sib) {
    if (sib === node) return depth > 0
    if (sib.nodeType === Node.COMMENT_NODE) {
      const value = (sib as Comment).nodeValue ?? ''
      if (value.startsWith(BF_SCOPE_COMMENT_PREFIX)) depth++
      else if (value.startsWith(BF_SCOPE_COMMENT_END_PREFIX) && depth > 0) depth--
    }
    sib = sib.nextSibling
  }
  return false
}

/**
 * Check if an element is within the range of a comment-based scope.
 * The range is from the comment node to the next bf-scope: comment (or end of parent).
 */
function isInCommentScopeRange(element: Element, commentNode: Comment): boolean {
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

// --- find ---

/**
 * Find an element within a scope.
 * Enumerates candidates via candidatesInScope generator, then applies
 * context-specific filtering (scope-aware, ignoreScope, or comment-scope).
 * Portals are searched as a final fallback via findInPortals.
 *
 * @param scope - The scope element to search within
 * @param selector - CSS selector to match
 * @param ignoreScope - Skip scope boundary checks (for parent-owned ^-prefixed slots)
 * @returns The matching element or null
 */
export function find(
  scope: Element | null,
  selector: string,
  ignoreScope?: boolean
): Element | null {
  if (!scope) return null

  const commentInfo = commentScopeRegistry.get(scope)

  // Self-match: check scope element first (for non-comment scopes)
  if (!commentInfo && scope.matches?.(selector)) return scope

  // Enumerate candidates and apply filter
  for (const candidate of candidatesInScope(scope, selector)) {
    if (ignoreScope) return candidate
    if (commentInfo) {
      // Comment scope: top-level siblings in the comment range are always
      // accepted (even if they have bf-s, like proxy elements). A descendant
      // nested inside one of those siblings is accepted unless a *nested*
      // child scope sits between it and this one — i.e. its nearest bf-s
      // ancestor falls within this comment's own sibling range. An ancestor
      // bf-s element outside that range doesn't disqualify the candidate:
      // a fragment-root child mounted inside a normal parent island always
      // has one, and `.closest()` alone can't tell the two apart (#2302).
      if (candidate.parentElement === commentInfo.commentNode.parentElement) return candidate
      const nearestScope = candidate.closest(`[${BF_SCOPE}]`)
      if (!nearestScope || !isInCommentScopeRange(nearestScope, commentInfo.commentNode)) return candidate
    } else {
      if (belongsToScope(candidate, scope)) return candidate
    }
  }

  // Portal search (outside scope's DOM subtree)
  const scopeId = commentInfo?.scopeId ?? getScopeId(scope)
  if (scopeId) return findInPortals(scopeId, selector)

  return null
}

/**
 * Find a conditional's own target (a `bf-c="id"` element, for `insert.ts`)
 * within `scope`'s content range.
 *
 * Deliberately narrower than `find()`: for a regular (non-comment) scope,
 * this is a **plain, unfiltered** `scope.querySelector(selector)` — not
 * `find()`'s `belongsToScope`-gated search. `belongsToScope` accepts a
 * candidate only if `candidate.closest('[bf-s]')` is *exactly* `scope` —
 * which can never hold when `scope` itself carries no `bf-s`. That's the
 * common case for `insert()`'s `region.bindScope`: a `mapArray` loop item's
 * cloned template root (e.g. a `.comment-item` `<div>`) is keyed by
 * `data-key` for reconciliation, not given its own `bf-s`, so any `bf-c`
 * conditional inside that item would be rejected outright by
 * `belongsToScope` — not because of any nested-child-scope subtlety, just
 * because `scope` itself isn't `bf-s`-addressable. Using `find()` here
 * previously broke exactly that shape (piconic-ai/barefootjs#2313's first
 * attempt, caught by the `site/ui` e2e suite's `SocialThreadDemo`
 * comment-editing test — a per-comment `editing` conditional inside a
 * `sortedComments().map(...)` loop item with no `bf-s` of its own).
 *
 * A comment-scope proxy (fragment-root component) still gets the
 * comment-range-bounded, nested-fragment-excluding search — the same rule
 * `find()`'s comment branch uses — since that IS what's needed to walk past
 * a fragment-root's own top-level siblings correctly (#2312).
 */
export function findCondTarget(scope: Element, selector: string): Element | null {
  const commentInfo = commentScopeRegistry.get(scope)
  if (!commentInfo) {
    return scope.querySelector(selector)
  }
  for (const candidate of candidatesInScope(scope, selector)) {
    if (candidate.parentElement === commentInfo.commentNode.parentElement) return candidate
    const nearestScope = candidate.closest(`[${BF_SCOPE}]`)
    if (!nearestScope || !isInCommentScopeRange(nearestScope, commentInfo.commentNode)) return candidate
  }
  return null
}

/**
 * Search in portals owned by a scope.
 */
function findInPortals(scopeId: string, selector: string): Element | null {
  const portals = document.querySelectorAll(`[${BF_PORTAL_OWNER}="${scopeId}"]`)
  for (const portal of portals) {
    if (portal.matches?.(selector)) return portal
    // Search within portal, excluding elements inside nested component scopes
    const matches = portal.querySelectorAll(selector)
    for (const match of matches) {
      const nearestScope = match.closest(`[${BF_SCOPE}]`)
      if (!nearestScope) {
        return match
      }
    }
  }
  return null
}

// --- shorthand finders ---

/**
 * Find an element matching a selector, checking the element itself first,
 * then its descendants. Unlike querySelector() which only searches descendants,
 * this also matches the root element.
 *
 * Descendant candidates that fall inside a nested child component's own
 * scope are skipped (`isInsideNestedChildScope`) — compiler slot IDs
 * (`bf="sN"`) are assigned independently per component file, so a slot
 * number can coincidentally collide between `el`'s own template and a
 * child component mounted somewhere inside it (#2316).
 *
 * Used by compiler-generated code for event binding and attribute updates
 * on loop items where the target may be the loop item's root element itself.
 */
export function qsa(el: Element | null, selector: string): Element | null {
  if (!el) return null

  // Comma-separated selectors are tried in priority order (left-to-right)
  // rather than relying on `querySelector`'s document-order semantics —
  // the compiler-emitted slot-child selector
  // `[bf-h="X"][bf-m="sN"], [bf-s$="_sN"]` resolves to the most specific
  // match (#1249).
  if (selector.includes(',')) {
    for (const clause of splitTopLevelCommas(selector)) {
      const c = clause.trim()
      if (!c) continue
      const hit = qsa(el, c)
      if (hit) return hit
    }
    return null
  }

  // #1220 cross-binding skip: bare slot-suffix lookups defer to
  // `qsaChildScope` so candidates whose bf-s already carries a deeper
  // `_sN_sN` path (synthesized child's nested scope) are skipped.
  if (SLOT_SUFFIX_SELECTOR.test(selector)) {
    return qsaChildScope(el, selector)
  }
  if (el.matches(selector)) return el

  // Fast path: the overwhelmingly common case has no nested-child-scope
  // collision, so a single querySelector() (matching the old behavior)
  // resolves it without the cost of enumerating every match. Only fall
  // back to the full querySelectorAll() scan — needed to skip past a
  // rejected candidate to the next DOM-order match — when the first hit
  // actually turns out to belong to a nested child scope.
  const first = el.querySelector(selector)
  if (!first || !isInsideNestedChildScope(first, el)) return first
  for (const candidate of el.querySelectorAll(selector)) {
    if (candidate !== first && !isInsideNestedChildScope(candidate, el)) return candidate
  }
  return null
}

/** Split a CSS selector list on top-level commas, ignoring commas inside
 *  `[…]` attribute selectors or `(…)` pseudo-class arguments. */
function splitTopLevelCommas(selector: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector.charCodeAt(i)
    if (ch === 0x5b /* [ */ || ch === 0x28 /* ( */) depth++
    else if (ch === 0x5d /* ] */ || ch === 0x29 /* ) */) depth--
    else if (ch === 0x2c /* , */ && depth === 0) {
      out.push(selector.slice(start, i))
      start = i + 1
    }
  }
  out.push(selector.slice(start))
  return out
}

/**
 * Selector form `[bf-s$="_sN"]` — emitted by the compiler for bare child-
 * component scope lookups. Used to gate the #1220 nested-slot skip so the
 * filter only fires for these compiled bf-s suffix lookups (not for
 * unrelated selectors that happen to match).
 */
const SLOT_SUFFIX_SELECTOR = /^\[bf-s\$="_s\d+"\]$/

/**
 * Recognises bf-s values whose final segment is a nested-slot path
 * (`…_sM_sN`). These show up when a synthesized component (e.g.
 * `BFInlineJsxCallback`) renders descendants whose own internal scope
 * happens to end in `_sN`, coincidentally matching a sibling slot's loose
 * suffix selector. The slot-suffix lookup helpers skip these so the wrong
 * `initChild` never fires (#1220).
 *
 * Why this is a safe filter: legitimate child shapes anchored on a
 * stateful intermediate parent (e.g. `Card_<rand>_<slot>`) have exactly
 * one trailing `_sN`. The two-segment shape only arises when a
 * stateless-only stack of intermediate components nests further, which
 * never happens by design — `_parentScopeId` is set only by `insert()`
 * (whose owning component carries client interactivity and therefore a
 * fresh `${name}_<rand>` scope) and by `render()` (top-level entry).
 */
const NESTED_SLOT_SUFFIX = /_s\d+_s\d+$/

/**
 * `querySelector` variant that skips #1220 cross-binding candidates: any
 * descendant whose bf-s already carries a deeper nested-slot path is
 * ignored. Falls back to the standalone match-or-descendant semantics
 * (mirrors `qsa`'s self-match) when no candidate qualifies.
 *
 * Compiler-generated static-array child-init code calls this in place of
 * a bare `containerVar.querySelector(...)` so the filter runs even on
 * paths that don't pass through `qsa` (#1220 review feedback).
 */
export function qsaChildScope(scope: Element, selector: string): Element | null {
  if (scope.matches(selector)) {
    const bfs = scope.getAttribute(BF_SCOPE) || ''
    if (!NESTED_SLOT_SUFFIX.test(bfs)) return scope
  }
  for (const candidate of scope.querySelectorAll(selector)) {
    const bfs = candidate.getAttribute(BF_SCOPE) || ''
    if (!NESTED_SLOT_SUFFIX.test(bfs)) return candidate
  }
  return null
}

/**
 * `querySelectorAll` variant with the same #1220 filter. Returns the
 * matching descendants in document order, with nested-slot collisions
 * dropped so the caller's `forEach((el, idx) => …)` pairs scope
 * elements with array items by position correctly.
 */
export function qsaChildScopes(scope: Element, selector: string): Element[] {
  const out: Element[] = []
  for (const candidate of scope.querySelectorAll(selector)) {
    const bfs = candidate.getAttribute(BF_SCOPE) || ''
    if (!NESTED_SLOT_SUFFIX.test(bfs)) out.push(candidate)
  }
  return out
}

/**
 * Find elements within a scope by slot IDs.
 * Used by compiler-generated code for regular slot element references.
 * Always returns an array — callers use destructuring.
 *
 * For parent-owned slots (^-prefixed IDs like '^s3'), searches all descendants
 * ignoring scope boundaries. This handles elements passed as children to child
 * components — they are owned by the parent but rendered inside the child's scope.
 */
export function $(scope: Element | null, ...ids: string[]): (Element | null)[] {
  return ids.map(id => {
    // Parent-owned slots (^-prefixed) search all descendants ignoring scope boundaries,
    // because the ^ prefix guarantees the element is owned by the calling scope.
    const ignoreScope = id.startsWith(BF_PARENT_OWNED_PREFIX)
    return find(scope, `[${BF_SLOT}="${id}"]`, ignoreScope || undefined)
  })
}

/**
 * Find child component scope elements by slot ID or component name.
 * - Slot ID (e.g., 's1'): uses suffix match [bf-s$="_s1"]
 * - Component name (e.g., 'Counter'): uses prefix match [bf-s^="Counter_"]
 * Always returns an array — callers use destructuring.
 */
export function $c(scope: Element | null, ...ids: string[]): (Element | null)[] {
  return ids.map(id => $cSingle(scope, id))
}

/**
 * Resolve a single child component scope by slot ID or component name.
 *
 * Two ID formats:
 *   - Slot ID ('s0', 's1', ...): Uses parent scope ID for precise suffix match.
 *     e.g., [bf-s$="Parent_abc_s3"] — matches "Parent_abc_s3" but NOT "Parent_abc_s4_s3".
 *   - Component name ('Counter'): Prefix match [bf-s^="Counter_"]. Unambiguous.
 *
 * Uses candidatesInScope directly (not find()) because child scope searches
 * don't need slot-level scope boundary checks — the CSS selector itself is
 * precise enough to identify the correct element.
 *
 * Dual-scope: A proxy element can host both a comment scope (fragment-root parent)
 * and a bf-s scope (proxied child). getDualScopeIds() returns both IDs so the
 * search tries each parent identity.
 */
function $cSingle(scope: Element | null, id: string): Element | null {
  if (!scope) return null
  // Strip ^ prefix defensively — component slot IDs should never have it,
  // but guard against compiler edge cases to avoid silent initialization failures.
  const cleanId = id.startsWith(BF_PARENT_OWNED_PREFIX) ? id.slice(1) : id

  // --- Component name path (unambiguous) ---
  if (!/^s\d/.test(cleanId)) {
    return findChildScope(scope, `[${BF_SCOPE}^="${cleanId}_"]`)
  }

  // --- Slot ID path: precise suffix match using parent scope ID ---
  const parentScopeIds = getDualScopeIds(scope)

  if (parentScopeIds.length > 0) {
    for (const parentId of parentScopeIds) {
      const result = findChildScope(scope, `[${BF_SCOPE}$="${parentId}_${cleanId}"]`)
      if (result) return result
    }
    // Precise match found nothing. Check if scope itself matches the short suffix
    // (fragment root / inlined component where scope IS the child).
    if (scope.matches?.(`[${BF_SCOPE}$="_${cleanId}"]`)) return scope
    // Fragment-root child: no element carries the child's scope id — it is
    // declared by a bf-scope: comment instead (#2289).
    return findCommentChildScope(scope, parentScopeIds, cleanId)
  }

  // Fallback: no parent scope ID available — use short suffix match (best-effort)
  return findChildScope(scope, `[${BF_SCOPE}$="_${cleanId}"]`)
    ?? findCommentChildScope(scope, [], cleanId)
}

/**
 * Resolve a comment-anchored child scope (fragment-root child, #2289).
 *
 * A child component whose root is a JSX Fragment has no element carrying
 * `bf-s`/`bf-h`/`bf-m` — its scope is declared by a
 * `<!--bf-scope:<parentId>_<slotId>|h=...|m=...-->` comment. The element
 * selectors in `$cSingle` / `findSsrScopeBySlotIn` can never match it, so
 * without this fallback the parent's `initChild(...)` receives `null` and
 * the child is never initialized: every callback prop dies silently and
 * no reactive update ever reaches the child.
 *
 * Matches on the scope id embedded in the comment (`<parentId>_<slotId>`,
 * the same convention the element path's `[bf-s$="<parentId>_<slotId>"]`
 * selector relies on) rather than on the `|h=`/`|m=` segments — the scope
 * id is the first `|`-free token, so matching it cannot be confused by
 * props JSON that happens to contain `|h=`.
 *
 * On match, the proxy element (first element sibling after the comment,
 * falling back to the comment's parent) is registered in
 * `commentScopeRegistry` so the child's own `$`/`$t` queries walk the
 * comment range — the same wiring `hydrateCommentScope` performs for
 * walker-owned root fragments.
 */
export function findCommentChildScope(
  scope: Element,
  parentIds: readonly string[],
  slotId: string,
): Element | null {
  for (const comment of commentsInScope(scope)) {
    const id = parseCommentScopeId(comment.nodeValue ?? '', BF_SCOPE_COMMENT_PREFIX)
    if (!id) continue
    const matches = parentIds.length > 0
      ? parentIds.some(parentId => id === `${parentId}_${slotId}`)
      : id.endsWith(`_${slotId}`) && !NESTED_SLOT_SUFFIX.test(id)
    if (!matches) continue

    const proxyEl = nextElementSibling(comment) ?? comment.parentElement
    if (!proxyEl) return null
    commentScopeRegistry.set(proxyEl, { commentNode: comment, scopeId: id })
    return proxyEl
  }
  return null
}

/**
 * Enumerate comment nodes in a scope's DOM range: the comment-scope
 * sibling range for comment-anchored scopes, the element subtree
 * otherwise. Mirrors candidatesInScope's notion of "where the scope's
 * content lives", but yields comments instead of elements.
 *
 * Exported for `insert.ts`'s branch-swap path (`updateFragmentConditional`),
 * which otherwise walked `scope`'s own descendants with a bare
 * `document.createTreeWalker` — never finding a conditional's
 * `bf-cond-start:`/`bf-cond-end:` markers when they sit as a *sibling* of
 * the scope's comment-scope proxy rather than nested inside it (true for
 * any fragment-root component's own top-level conditional, since the proxy
 * is one specific top-level element and the conditional's markers may be
 * others). See piconic-ai/sora's `ListSidebar` for the real-world repro.
 */
export function* commentsInScope(scope: Element): Generator<Comment> {
  const commentInfo = commentScopeRegistry.get(scope)

  if (commentInfo) {
    const boundary = getCommentScopeBoundary(commentInfo.commentNode)
    let node: Node | null = commentInfo.commentNode.nextSibling
    while (node && node !== boundary) {
      if (node.nodeType === Node.COMMENT_NODE) {
        yield node as Comment
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        yield* commentsUnder(node as Element)
      }
      node = node.nextSibling
    }
    return
  }

  yield* commentsUnder(scope)
}

function* commentsUnder(root: Element): Generator<Comment> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    yield walker.currentNode as Comment
  }
}

/**
 * Find a child scope element using candidatesInScope + portal search.
 * Unlike find(), this accepts any matching candidate without slot-level
 * scope boundary checks — the selector is assumed to be precise enough.
 */
function findChildScope(scope: Element, selector: string): Element | null {
  // Check scope itself (handles self-match for fragment root / inlined components)
  if (scope.matches?.(selector)) return scope

  for (const candidate of candidatesInScope(scope, selector)) {
    return candidate
  }

  // Portal search
  const commentInfo = commentScopeRegistry.get(scope)
  const scopeId = commentInfo?.scopeId ?? getScopeId(scope)
  if (scopeId) return findInPortals(scopeId, selector)

  return null
}

/**
 * Get all possible parent scope IDs for child resolution.
 *
 * Dual-registered elements (comment scope proxy + bf-s attribute) host children
 * from two components: the fragment-root component (comment scope) and the
 * proxied child component (bf-s). Both IDs are returned so $cSingle can try each.
 *
 * Returns deduplicated array of scope IDs, comment scope first (most common case).
 */
function getDualScopeIds(scope: Element | null): string[] {
  if (!scope) return []

  const bfScopeId = getScopeId(scope)

  const commentInfo = commentScopeRegistry.get(scope)
  const commentScopeId = commentInfo?.scopeId ?? null

  if (commentScopeId && bfScopeId && commentScopeId !== bfScopeId) {
    return [commentScopeId, bfScopeId]
  }

  const id = commentScopeId ?? bfScopeId
  return id ? [id] : []
}

// --- $t: text node finder via comment markers ---

/**
 * Find Text nodes for reactive text expressions marked by comment nodes.
 * Expects marker format: <!--bf:sX-->text<!--/-->
 * Always returns an array — callers use destructuring.
 *
 * Uses a single TreeWalker pass to find all markers at once,
 * with early exit when all are found.
 */
export function $t(scope: Element | null, ...ids: string[]): (Text | null)[] {
  const results: (Text | null)[] = new Array(ids.length).fill(null)
  if (!scope) return results

  const commentInfo = commentScopeRegistry.get(scope)
  const searchRoot: Node = commentInfo ? (commentInfo.commentNode.parentNode ?? scope) : scope

  // When the element is not a component scope (e.g. a loop item element),
  // skip ownership checks — all markers inside it belong to this element.
  const isComponentScope = scope.hasAttribute(BF_SCOPE) || commentInfo != null

  // Build marker → index map for O(1) lookup during walk
  const markerMap = new Map<string, { index: number; isParentOwned: boolean }>()
  for (let i = 0; i < ids.length; i++) {
    markerMap.set(`bf:${ids[i]}`, {
      index: i,
      isParentOwned: ids[i].startsWith(BF_PARENT_OWNED_PREFIX),
    })
  }

  let remaining = ids.length
  const walker = document.createTreeWalker(searchRoot, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode() && remaining > 0) {
    const comment = walker.currentNode as Comment
    const entry = markerMap.get(comment.nodeValue ?? '')
    if (!entry || results[entry.index] !== null) continue

    if (isComponentScope && !entry.isParentOwned && !commentBelongsToScope(comment, scope, commentInfo)) {
      continue
    }
    results[entry.index] = textNodeAfterComment(comment)
    remaining--
  }
  return results
}

/**
 * Get or create the Text node immediately after a comment marker.
 *
 * Exported as `tAfter` for compiler-generated hoisted-loop codegen (#2143):
 * when a loop row's text-marker position is known at compile time as a
 * child-index path, the compiler resolves the `<!--bf:sN-->` Comment node
 * directly (skipping `$t`'s TreeWalker scan) and calls this to get the
 * same create-if-absent Text node `$t` would have returned.
 */
export function textNodeAfterComment(comment: Comment): Text {
  const next = comment.nextSibling
  if (next?.nodeType === Node.TEXT_NODE) {
    return next as Text
  }
  // No text node exists (empty initial value) — create one
  const textNode = document.createTextNode('')
  comment.parentNode?.insertBefore(textNode, comment.nextSibling)
  return textNode
}

export { textNodeAfterComment as tAfter }

/**
 * Check if a comment node belongs to the given scope (not inside a nested child scope).
 */
function commentBelongsToScope(
  comment: Comment,
  scope: Element,
  commentInfo: { commentNode: Comment; scopeId: string } | undefined
): boolean {
  // Walk up from the comment to find the nearest scope element
  const parent = comment.parentElement
  if (!parent) return false

  // If the comment's parent element has a bf-s attribute that is NOT our scope,
  // then the comment is inside a child component's scope
  const parentScope = parent.closest(`[${BF_SCOPE}]`)
  if (parentScope === scope) return true

  // For comment-based scopes, the scope element is virtual
  if (commentInfo) {
    return isInCommentScopeRange(parent, commentInfo.commentNode)
  }

  // If the nearest scope is inside our scope, the comment is in a nested scope
  return false
}
