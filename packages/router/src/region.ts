/**
 * Read a fetched page and lift out the swappable region subtree(s).
 *
 * The router fetches an ordinary full-page HTML response (no protocol header),
 * parses it client-side, and matches its `[bf-region]` boundaries against the
 * live document. v0 swaps a single broad region; v2 matches compiler-derived
 * nested/sibling regions by their stable `bf-region` id and swaps only the
 * deepest ones whose *owned* content differs (spec/router.md "Regions"). Island
 * module scripts (`<script type=module src>`) sit at body-end, outside any
 * region, so they are collected from the whole parsed document.
 */

import { BF_REGION } from '@barefootjs/shared'
import type { RouterState } from './types.ts'

/** Parse a fetched page's HTML into a detached document. */
export function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}


/**
 * Same-origin absolute URLs of `<script type=module src>` in a tree, resolved
 * against `baseUrl`. For a fetched page that is the response's **final URL**
 * (not `location`), so a relative module `src` in the incoming document loads
 * from the right place (spec/router.md lifecycle step 4).
 */
export function collectModuleScripts(root: ParentNode, baseUrl: string): Set<string> {
  const out = new Set<string>()
  for (const s of root.querySelectorAll('script[type="module"][src]')) {
    const src = s.getAttribute('src')
    if (!src) continue
    try {
      const url = new URL(src, baseUrl)
      // Cross-origin module scripts are the browser's to own — skip them.
      if (url.origin === window.location.origin) out.add(url.href)
    } catch {
      /* skip un-resolvable src */
    }
  }
  return out
}

/** A swap target: a live region element and its counterpart in the incoming doc. */
export interface RegionSwap {
  current: Element
  incoming: Element
}

export type SwapPlan =
  /** Matched compiler-derived regions: swap exactly `targets` (may be empty when nothing changed). */
  | { mode: 'regions'; targets: RegionSwap[] }
  /** Region ids don't line up (or collide): fall back to the single broadest-region swap (v0). */
  | { mode: 'broadest' }

/**
 * Index every `[bf-region]` in `root` by its `bf-region` id. Returns `null` if
 * two regions share an id — they can't be matched 1:1 across documents, so the
 * caller falls back to the broadest single-region swap.
 */
function indexRegions(root: ParentNode, selector: string): Map<string, Element> | null {
  const map = new Map<string, Element>()
  for (const el of root.querySelectorAll(selector)) {
    const id = el.getAttribute(BF_REGION) ?? ''
    if (map.has(id)) return null
    map.set(id, el)
  }
  return map
}

/**
 * A region's **owned** content: its inner HTML with every *nested* `[bf-region]`
 * subtree masked out (replaced by an id-keyed placeholder). Two regions compare
 * equal when only their nested regions' interiors differ — so an outer region
 * stays mounted when just an inner region changed (the deepest differing region
 * is the one that swaps).
 */
export function ownedContentKey(region: Element, selector: string): string {
  const clone = region.cloneNode(true) as Element
  // `querySelectorAll` on the clone returns descendants only (not the clone
  // itself), so this masks nested regions, not this one.
  for (const nested of Array.from(clone.querySelectorAll(selector))) {
    // A deeper region already vanished when its ancestor region was masked.
    if (!clone.contains(nested)) continue
    const mask = (clone.ownerDocument ?? document).createElement('bf-region-mask')
    mask.setAttribute('data-id', nested.getAttribute(BF_REGION) ?? '')
    nested.replaceWith(mask)
  }
  return clone.innerHTML
}

/**
 * Decide which regions to swap between the live document and a parsed incoming
 * document. When both expose the **same set** of region ids, swap the *topmost*
 * regions whose owned content differs (an ancestor swap rebuilds its nested
 * regions, so a nested candidate inside another candidate is dropped). When the
 * id sets differ or collide, fall back to the broadest single-region swap.
 */
export function planRegionSwaps(
  currentRoot: ParentNode,
  incomingRoot: ParentNode,
  selector: string,
): SwapPlan {
  const cur = indexRegions(currentRoot, selector)
  const inc = indexRegions(incomingRoot, selector)
  if (!cur || !inc || !sameKeys(cur, inc)) return { mode: 'broadest' }

  const candidates: RegionSwap[] = []
  for (const [id, current] of cur) {
    const incoming = inc.get(id) as Element
    if (ownedContentKey(current, selector) !== ownedContentKey(incoming, selector)) {
      candidates.push({ current, incoming })
    }
  }
  // Drop any candidate nested inside another candidate (in the live document):
  // swapping the ancestor replaces it anyway.
  const targets = candidates.filter(
    (c) => !candidates.some((o) => o !== c && o.current.contains(c.current)),
  )
  return { mode: 'regions', targets }
}

function sameKeys(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false
  for (const k of a.keys()) if (!b.has(k)) return false
  return true
}

/**
 * Adopt an incoming region's child nodes into the live document so they're ready
 * to insert (the parsed nodes belong to a detached document).
 */
export function importRegionChildren(incoming: Element): Node[] {
  return Array.from(incoming.childNodes).map((n) => document.importNode(n, true))
}

/**
 * Prefetch-path read: parse once, confirm the page belongs to this shell, and
 * return only its island module srcs (resolved against `baseUrl`). It does
 * **not** clone/import any region subtree — prefetch only needs the module list,
 * and importing a large region is wasted work. Returns `null` when the page has
 * no region.
 */
export function collectRegionModuleSrcs(
  html: string,
  selector: string,
  baseUrl: string,
): string[] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc.querySelector(selector)) return null
  return [...collectModuleScripts(doc, baseUrl)]
}

export async function loadNewModules(state: RouterState, srcs: string[]): Promise<void> {
  const fresh = srcs.filter((s) => !state.loadedModules.has(s))
  await Promise.all(
    fresh.map(async (src) => {
      try {
        await state.loadModule(src)
        // Mark as loaded only AFTER a successful import. Marking *before* the
        // await (to dedupe a concurrent nav) risks a false positive: if this
        // import fails while a second navigation is already in flight, that nav
        // would see the src as "loaded", skip it, and hydrate without the module.
        // `loadModule` (native `import()`) is idempotent, so two overlapping
        // navigations importing the same src is a cheap no-op second call, not a
        // double fetch.
        state.loadedModules.add(src)
      } catch {
        // Left unmarked → a later navigation retries the import.
      }
    }),
  )
}
