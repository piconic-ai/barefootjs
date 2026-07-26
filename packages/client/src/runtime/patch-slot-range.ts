/**
 * In-place patch for a `.map()` preamble-patched loop region — the
 * `<!--bf:sN-->...<!--/-->` marker pair around a loop-body expression child
 * whose free identifiers read a preamble-declared local (`{cells}` in
 * `arr.map(t => { const cells = []; ...; return <tr>{cells}<td>{t.name}</td></tr> })`,
 * #2389). `mapArray` reuses the same row element on a same-key item update
 * via per-item `setItem`, re-running only the row's wired text/attr-slot
 * effects — a preamble-derived region has neither, so without this it
 * freezes at its mount-time content forever. The compiled per-item
 * `createEffect` (see `stringifyPlainLoop`'s `emitPreambleRegionEffects` in
 * `@barefootjs/jsx`) calls this whenever the re-computed region HTML
 * differs from the last-patched value.
 *
 * Sibling of `patchLeaf` (same "wholesale replace, preserve identity"
 * contract), but scoped to a marker-delimited RANGE inside an element
 * rather than the element itself — a region has no element of its own to
 * hold an identity, only the comment pair.
 *
 * Contract: `start` is the `<!--bf:sN-->` Comment. Its matching end is the
 * nearest following sibling `<!--/-->` comment at the SAME nesting depth —
 * any `bf:`-prefixed comment encountered along the way opens a FURTHER
 * nested region (a leaf rendered inside this one could carry its own
 * ordinary text-slot markers) and increments a depth counter so that
 * region's own `/` doesn't prematurely close the outer range. Every node
 * strictly between the two markers is removed, then `html` is parsed via a
 * `<template>` and its content is inserted before the end marker. `start`
 * and the end marker themselves are never removed — they stay as the
 * region's permanent boundary for the next patch.
 */
export function patchSlotRange(start: Comment, html: string): void {
  const parent = start.parentNode
  if (!parent) return

  let depth = 0
  let end: Comment | null = null
  const toRemove: Node[] = []
  let node: Node | null = start.nextSibling
  while (node) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue ?? ''
      if (value.startsWith('bf:')) {
        depth++
      } else if (value === '/') {
        if (depth === 0) {
          end = node as Comment
          break
        }
        depth--
      }
    }
    toRemove.push(node)
    node = node.nextSibling
  }
  // No matching end marker — malformed/unexpected DOM shape. Do nothing
  // rather than risk deleting past the region's intended boundary.
  if (!end) return

  for (const n of toRemove) parent.removeChild(n)

  const tpl = document.createElement('template')
  tpl.innerHTML = html
  parent.insertBefore(tpl.content, end)
}
