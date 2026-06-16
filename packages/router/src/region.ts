/**
 * Read a fetched page and lift out the swappable region subtree.
 *
 * The router fetches an ordinary full-page HTML response (no protocol header),
 * parses it client-side, and extracts the `[bf-region]` children. Island module
 * scripts (`<script type=module src>`) sit at body-end, outside the region, so
 * they are collected from the whole parsed document.
 */

import type { RegionContent, RouterState } from './types.ts'

/** Same-origin absolute URLs of `<script type=module src>` in a tree. */
export function collectModuleScripts(root: ParentNode): Set<string> {
  const out = new Set<string>()
  for (const s of root.querySelectorAll('script[type="module"][src]')) {
    const src = s.getAttribute('src')
    if (!src) continue
    try {
      const url = new URL(src, window.location.href)
      // Cross-origin module scripts are the browser's to own — skip them.
      if (url.origin === window.location.origin) out.add(url.href)
    } catch {
      /* skip un-resolvable src */
    }
  }
  return out
}

export function extractRegion(html: string, selector: string): RegionContent | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const region = doc.querySelector(selector)
  if (!region) return null // not part of this shell → caller hard-navigates
  const title = doc.querySelector('title')?.textContent ?? null
  const moduleSrcs = [...collectModuleScripts(doc)]
  // Adopt the parsed nodes into the live document so they're ready to insert.
  const nodes = Array.from(region.childNodes).map((n) => document.importNode(n, true))
  return { nodes, title, moduleSrcs }
}

export async function loadNewModules(state: RouterState, srcs: string[]): Promise<void> {
  const fresh = srcs.filter((s) => !state.loadedModules.has(s))
  await Promise.all(
    fresh.map(async (src) => {
      state.loadedModules.add(src) // mark first so a concurrent nav won't re-import
      try {
        await state.loadModule(src)
      } catch {
        // Un-mark on failure so a later navigation retries the import.
        state.loadedModules.delete(src)
      }
    }),
  )
}
