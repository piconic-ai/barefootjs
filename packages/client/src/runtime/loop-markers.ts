/**
 * BarefootJS - Loop Boundary Marker Lookup
 *
 * `<!--bf-loop:<id>-->` / `<!--bf-/loop:<id>-->` comment markers delimit a
 * loop's rendered range inside its container so `mapArray`/`mapArrayAnchored`
 * (`./map-array.ts`) can reconcile only that range without disturbing
 * non-loop siblings. These lookups used to also back the now-removed
 * `reconcileElements`/`reconcileList` element-reconciler (slot unification
 * A4); they remain as the compiler-facing marker API.
 */

import { BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker } from '@barefootjs/shared'

/**
 * Find loop boundary comment markers in a container.
 *
 * `markerId` scopes the lookup to `<!--bf-loop:<id>-->` / `<!--bf-/loop:<id>-->`
 * so sibling loops under the same parent disambiguate (#1087). Without an id,
 * accepts the legacy unscoped form too — used by tests that build containers
 * without compiler-emitted markers.
 */
function findLoopMarkers(
  container: HTMLElement,
  markerId?: string,
): { startMarker: Comment | null; endMarker: Comment | null } {
  let startMarker: Comment | null = null
  let endMarker: Comment | null = null
  if (markerId) {
    const startVal = loopStartMarker(markerId)
    const endVal = loopEndMarker(markerId)
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue
      if (value === startVal) startMarker = node as Comment
      else if (value === endVal) endMarker = node as Comment
    }
  } else {
    const startPrefix = `${BF_LOOP_START}:`
    const endPrefix = `${BF_LOOP_END}:`
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue ?? ''
      if (!startMarker && (value === BF_LOOP_START || value.startsWith(startPrefix))) {
        startMarker = node as Comment
      } else if (!endMarker && (value === BF_LOOP_END || value.startsWith(endPrefix))) {
        endMarker = node as Comment
      }
    }
  }
  if (startMarker && endMarker) return { startMarker, endMarker }
  return { startMarker: null, endMarker: null }
}

/** Get all Element nodes between start and end comment markers. */
function getElementsBetweenMarkers(start: Comment, end: Comment): Element[] {
  const elements: Element[] = []
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      elements.push(node as Element)
    }
    node = node.nextSibling
  }
  return elements
}

/**
 * Get loop children from a container, respecting bf-loop boundary markers.
 * When markers are present, returns only elements between them.
 * When absent, returns all children (backward compatible).
 * Exported for use by compiler-generated hydration code.
 */
export function getLoopChildren(container: HTMLElement, markerId?: string): HTMLElement[] {
  const { startMarker, endMarker } = findLoopMarkers(container, markerId)
  if (startMarker && endMarker) {
    return getElementsBetweenMarkers(startMarker, endMarker) as HTMLElement[]
  }
  return Array.from(container.children) as HTMLElement[]
}

/**
 * Like {@link getLoopChildren}, but returns every node between the loop
 * boundary markers — Comments (per-item `<!--bf-loop-i-->` markers) and
 * text included. The branch-clearing path needs to remove the per-item
 * marker comments alongside elements; otherwise stale markers would
 * accumulate when a branch swap forces mapArray to start over (#1212).
 */
export function getLoopNodes(container: HTMLElement, markerId?: string): Node[] {
  const { startMarker, endMarker } = findLoopMarkers(container, markerId)
  const nodes: Node[] = []
  if (startMarker && endMarker) {
    let node: Node | null = startMarker.nextSibling
    while (node && node !== endMarker) {
      nodes.push(node)
      node = node.nextSibling
    }
    return nodes
  }
  return Array.from(container.childNodes)
}
