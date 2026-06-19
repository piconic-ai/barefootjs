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

import { BF_HOST, BF_PROPS, BF_REGION, BF_SCOPE, BF_SCOPE_COMMENT_PREFIX } from '@barefootjs/shared'
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
  /**
   * Matched compiler-derived regions: swap exactly `targets` (may be empty when
   * nothing changed). `incomingKeys` is the owned-content key per matched region
   * id from the **incoming server render** — the caller commits it as the new
   * per-region baseline (see {@link planRegionSwaps}).
   */
  | { mode: 'regions'; targets: RegionSwap[]; incomingKeys: Map<string, string> }
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
 * subtree masked out (replaced by an id-keyed placeholder), and with per-render
 * **volatile hydration scaffolding** normalized away. Two regions compare equal
 * when only their nested regions' interiors differ — so an outer region stays
 * mounted when just an inner region changed (the deepest differing region is the
 * one that swaps).
 *
 * The normalization matters: a top-level island's scope id is randomized per
 * server render (`<div bf-s="Counter_a1b2c3">`), so two renders of the *same*
 * region are never byte-identical. Comparing raw `innerHTML` would flag every
 * region containing an island as "changed" and swap away its state — the
 * opposite of v2's goal. The diff therefore compares *content*, ignoring the
 * scope-id-carrying markers (`bf-s`, `bf-h`, and the id inside `bf-scope:`
 * comments); the structural markers (`bf` slot refs, `bf-m` slot ids, `bf-r`)
 * and any props stay, so a real content/prop change is still detected.
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
  stripVolatileHydration(clone)
  return clone.innerHTML
}

/** Hydration attributes carrying a per-render-random scope id — ignored by the diff. */
const VOLATILE_ATTRS = [BF_SCOPE, BF_HOST]

/** Strip per-render-volatile hydration scaffolding so the diff compares content, not scope ids. */
function stripVolatileHydration(root: Element): void {
  for (const a of VOLATILE_ATTRS) root.removeAttribute(a)
  normalizePropsAttr(root)
  const walker = (root.ownerDocument ?? document).createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  )
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.ELEMENT_NODE) {
      for (const a of VOLATILE_ATTRS) (node as Element).removeAttribute(a)
      normalizePropsAttr(node as Element)
    } else if ((node as Comment).data.startsWith(BF_SCOPE_COMMENT_PREFIX)) {
      ;(node as Comment).data = normalizeScopeComment((node as Comment).data)
    }
  }
}

/**
 * Blank the random `scopeID` inside a `bf-p` props attribute — the Go template
 * adapter's hydration form, emitted on every root island (`<div bf-p='{"scopeID":
 * "Sidebar_a1b2c3","pins":0}'>`). The scope id is regenerated per server render,
 * so without this a persistent sibling region whose island sits *inside* the
 * region element (e.g. the hand-authored `<aside bf-region>` sidebar) would
 * compare unequal every navigation and get swapped away, resetting its state.
 *
 * Mirrors {@link normalizeScopeComment} (the JS adapters carry props in a
 * `bf-scope:` comment instead): the scope id is blanked, every other prop kept,
 * so a real prop change is still detected. Non-JSON / scope-id-free values are
 * left untouched.
 *
 * Known limitation: only the TOP-LEVEL `scopeID` is blanked. A serialized
 * `children` prop embeds nested islands' scope ids, which are NOT normalized —
 * harmless today (the only such root, `PageShell`, IS a region element, so its
 * `bf-p` is excluded from the innerHTML diff), but a `children`-carrying root
 * placed *inside* a persistent region would still false-swap. See
 * https://github.com/piconic-ai/barefootjs/issues/1952.
 */
function normalizePropsAttr(el: Element): void {
  const raw = el.getAttribute(BF_PROPS)
  if (raw === null) return
  try {
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && 'scopeID' in obj) {
      obj.scopeID = ''
      el.setAttribute(BF_PROPS, JSON.stringify(obj))
    }
  } catch {
    // Not JSON we recognise — leave the attribute as authored.
  }
}

/**
 * Normalize a `bf-scope:<scopeId>[|h=<host>][|m=<slot>][|<props>]` comment: blank
 * the random `<scopeId>` and drop any `h=<host>` host token (both per-render
 * volatile), keeping the structural slot (`m=`) and props so a real prop change
 * is still detected.
 */
function normalizeScopeComment(data: string): string {
  const parts = data.slice(BF_SCOPE_COMMENT_PREFIX.length).split('|')
  parts[0] = '' // scope id → blanked
  const kept = parts.filter((p, i) => i === 0 || !p.startsWith('h='))
  return BF_SCOPE_COMMENT_PREFIX + kept.join('|')
}

/**
 * Decide which regions to swap between the live document and a parsed incoming
 * document. When both expose the **same set** of region ids, swap the *topmost*
 * regions whose owned content differs (an ancestor swap rebuilds its nested
 * regions, so a nested candidate inside another candidate is dropped). When the
 * id sets differ or collide, fall back to the broadest single-region swap.
 *
 * The "differs" test compares the incoming region's **server-rendered** owned
 * content against `baselines` — the owned-content key captured from the server
 * render currently displayed in that region — **not** the live DOM. A live
 * region's DOM may have been mutated by its islands (signal-driven updates), so
 * comparing against it would flag an unchanged region as changed and swap away
 * its state — the opposite of v2's goal. The caller seeds `baselines` from the
 * initial document and refreshes it from `incomingKeys` after each navigation.
 * A region missing from `baselines` falls back to its live owned content.
 */
export function planRegionSwaps(
  currentRoot: ParentNode,
  incomingRoot: ParentNode,
  selector: string,
  baselines: ReadonlyMap<string, string>,
): SwapPlan {
  const cur = indexRegions(currentRoot, selector)
  const inc = indexRegions(incomingRoot, selector)
  if (!cur || !inc || !sameKeys(cur, inc)) return { mode: 'broadest' }

  const incomingKeys = new Map<string, string>()
  const candidates: RegionSwap[] = []
  for (const [id, current] of cur) {
    const incoming = inc.get(id) as Element
    const incomingKey = ownedContentKey(incoming, selector)
    incomingKeys.set(id, incomingKey)
    const baseline = baselines.get(id) ?? ownedContentKey(current, selector)
    if (incomingKey !== baseline) candidates.push({ current, incoming })
  }
  // Drop any candidate nested inside another candidate (in the live document):
  // swapping the ancestor replaces it anyway.
  const targets = candidates.filter(
    (c) => !candidates.some((o) => o !== c && o.current.contains(c.current)),
  )
  return { mode: 'regions', targets, incomingKeys }
}

/**
 * Capture the owned-content key of every `[bf-region]` in `root`, keyed by id —
 * the per-region server-render baseline the swap planner compares against.
 */
export function captureRegionBaselines(root: ParentNode, selector: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const el of root.querySelectorAll(selector)) {
    out.set(el.getAttribute(BF_REGION) ?? '', ownedContentKey(el, selector))
  }
  return out
}

function sameKeys(a: Map<string, unknown>, b: Map<string, unknown>): boolean {
  if (a.size !== b.size) return false
  for (const k of a.keys()) if (!b.has(k)) return false
  return true
}

/**
 * True when `region` contains every other `[bf-region]` in its document — i.e.
 * it is a single root whose swap rebuilds them all. Used by the broadest
 * fallback: a root may be swapped wholesale (the v0 behaviour), but if the
 * regions are siblings a single swap would only half-update the page, so the
 * caller hard-navigates instead.
 */
export function isRootRegion(region: Element, selector: string): boolean {
  const root = region.ownerDocument ?? document
  for (const el of root.querySelectorAll(selector)) {
    if (el !== region && !region.contains(el)) return false
  }
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
