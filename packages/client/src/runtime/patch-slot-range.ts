import { BF_SCOPE } from '@barefootjs/shared'

/**
 * In-place patch for a `.map()` preamble-patched loop region — the
 * `<!--bf:sN-->...<!--/-->` marker pair around a loop-body expression child
 * whose free identifiers read a preamble-declared local (`{cells}` in
 * `arr.map(t => { const cells = []; ...; return <tr>{cells}<td>{t.name}</td></tr> })`,
 * #2389). `mapArray` reuses the same row element on a same-key item update
 * via per-item `setItem`, re-running only the row's wired text/attr-slot
 * effects — a preamble-derived region has neither, so without this it
 * freezes at its mount-time content forever. The compiled per-item
 * `createEffect` (see `emitPreambleRegionEffects` in `@barefootjs/jsx`)
 * calls this whenever the re-computed region HTML differs from the
 * last-patched value.
 *
 * Sibling of `patchLeaf` (same "wholesale replace, preserve identity"
 * contract), but scoped to a marker-delimited RANGE inside an element
 * rather than the element itself — a region has no element of its own to
 * hold an identity, only the comment pair.
 *
 * The start comment is located here, per call, rather than by a separate
 * mount-time lookup: the region effect's first run only records the
 * mount-time value, so a row that never changes pays ZERO lookup cost —
 * the scan runs only on an actual content change, over a single (small)
 * row element.
 *
 * Ownership: slot ids are per-component, so a marker under a nested `bf-s`
 * scope (a child component's own `bf:sN`) is never a candidate. Today
 * that's defense in depth — regions are only emitted for the plain
 * loop-plan shape, and `decideLoopRendering` routes any row containing
 * nested components or inner loops to the composite/component shapes,
 * which don't consume `preambleRegions` — but the guard keeps that safety
 * local instead of coupled to routing.
 *
 * A missing start or end marker means the DOM diverged from the compiled
 * template — warn and do nothing (sound-or-loud: never guess a boundary).
 *
 * Range contract: the matching end is the nearest following sibling
 * `<!--/-->` comment at the SAME nesting depth — any `bf:`-prefixed
 * comment along the way opens a FURTHER nested region (a leaf rendered
 * inside this one could carry its own ordinary text-slot markers) and
 * increments a depth counter so that region's own `/` doesn't prematurely
 * close the outer range. Every node strictly between the two markers is
 * removed, then `html` is parsed via a `<template>` and inserted before
 * the end marker. The two markers themselves are never removed — they
 * stay as the region's permanent boundary for the next patch.
 */
export function patchSlotRange(scope: Element, id: string, html: string): void {
  const marker = `bf:${id}`
  let start: Comment | null = null
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_COMMENT)
  while (walker.nextNode()) {
    const comment = walker.currentNode as Comment
    if (comment.nodeValue !== marker) continue
    let owned = true
    for (let el = comment.parentElement; el && el !== scope; el = el.parentElement) {
      if (el.hasAttribute(BF_SCOPE)) {
        owned = false
        break
      }
    }
    if (owned) {
      start = comment
      break
    }
  }
  const parent = start?.parentNode
  if (!start || !parent) {
    console.warn(`[barefootjs] preamble region marker bf:${id} not found in row; skipping patch`)
    return
  }

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
  if (!end) {
    // Malformed/unexpected DOM shape — never risk deleting past the
    // region's intended boundary.
    console.warn(`[barefootjs] preamble region bf:${id} has no end marker; skipping patch`)
    return
  }

  for (const n of toRemove) parent.removeChild(n)

  const tpl = document.createElement('template')
  tpl.innerHTML = html
  parent.insertBefore(tpl.content, end)
}
