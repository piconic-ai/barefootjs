/**
 * BarefootJS - Comment Scope Registry
 *
 * Registry for elements that serve as scope proxies for comment-based scopes.
 * Maps an element to its comment node and the sibling range boundary.
 */

import { BF_SCOPE_COMMENT_PREFIX, BF_SCOPE_COMMENT_END_PREFIX, BF_LOOP_ITEM, BF_LOOP_END } from '@barefootjs/shared'

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
