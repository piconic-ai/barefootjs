/**
 * BarefootJS - Comment Scope Registry
 *
 * Registry for elements that serve as scope proxies for comment-based scopes.
 * Maps an element to its comment node and the sibling range boundary.
 */

import { BF_SCOPE_COMMENT_PREFIX, BF_LOOP_ITEM, BF_LOOP_END } from '@barefootjs/shared'

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
 *  - `bf-scope:` anchor (fragment-root component): boundary is the next
 *    `bf-scope:` comment or the end of the parent's children (unchanged).
 *  - `bf-loop-i:<key>` anchor (loop item, 案Y/#1665): boundary is the next
 *    loop-item anchor (`bf-loop-i:*`) or the loop end marker (`bf-/loop:*`),
 *    so one item's range never bleeds into the next item or past the loop.
 */
export function getCommentScopeBoundary(commentNode: Comment): Node | null {
  const isLoopItem = commentNode.nodeValue?.startsWith(`${BF_LOOP_ITEM}:`) ?? false
  let node: Node | null = commentNode.nextSibling
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue ?? ''
      if (isLoopItem) {
        if (value.startsWith(`${BF_LOOP_ITEM}:`) || value.startsWith(`${BF_LOOP_END}:`)) {
          return node
        }
      } else if (value.startsWith(BF_SCOPE_COMMENT_PREFIX)) {
        return node
      }
    }
    node = node.nextSibling
  }
  return null // End of parent's children
}
