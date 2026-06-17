/**
 * Read a fetched page and lift out the swappable region subtree.
 *
 * The router fetches an ordinary full-page HTML response (no protocol header),
 * parses it client-side, and extracts the `[bf-region]` children. Island module
 * scripts (`<script type=module src>`) sit at body-end, outside the region, so
 * they are collected from the whole parsed document.
 */

import type { RegionContent, RouterState } from './types.ts'

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

export function extractRegion(
  html: string,
  selector: string,
  baseUrl: string,
): RegionContent | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const region = doc.querySelector(selector)
  if (!region) return null // not part of this shell → caller hard-navigates
  const title = doc.querySelector('title')?.textContent ?? null
  const moduleSrcs = [...collectModuleScripts(doc, baseUrl)]
  // Adopt the parsed nodes into the live document so they're ready to insert.
  const nodes = Array.from(region.childNodes).map((n) => document.importNode(n, true))
  return { nodes, title, moduleSrcs }
}

/**
 * Prefetch-path read: parse once, confirm the page belongs to this shell, and
 * return only its island module srcs (resolved against `baseUrl`). Unlike
 * {@link extractRegion} this does **not** clone/import the region's child nodes
 * — prefetch only needs the module list, and importing a large region's subtree
 * is wasted work. Returns `null` when the page has no region.
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
