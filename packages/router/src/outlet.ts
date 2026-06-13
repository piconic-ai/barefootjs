/**
 * Reading the navigation response: extract the `[bf-outlet]` subtree and the
 * island module scripts, and load the modules a swap introduced.
 */
import type { OutletContent, RouterState } from './types.ts'

/**
 * Absolute URLs of every **same-origin** `<script type="module" src>` under
 * `root`. Cross-origin module srcs are deliberately excluded — the router only
 * manages the app's own island modules; the browser owns the rest.
 */
export function collectModuleScripts(root: ParentNode): Set<string> {
  const out = new Set<string>()
  for (const s of root.querySelectorAll('script[type="module"][src]')) {
    const src = s.getAttribute('src')
    if (!src) continue
    try {
      const url = new URL(src, window.location.href)
      if (url.origin === window.location.origin) out.add(url.href)
    } catch {
      /* skip un-resolvable src */
    }
  }
  return out
}

/**
 * Extract the outlet content from a (full-page) navigation response: the
 * `[bf-outlet]` subtree's children, the `<title>`, and the island module
 * scripts (which sit at body-end, outside the outlet). Returns `null` when
 * the response has no outlet marker — that page belongs to a different shell,
 * so the caller hard-navigates.
 */
export function extractOutlet(html: string, selector: string): OutletContent | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const outlet = doc.querySelector(selector)
  if (!outlet) return null // not part of this shell → caller hard-navigates
  const title = doc.querySelector('title')?.textContent ?? null
  const moduleSrcs = [...collectModuleScripts(doc)]
  const nodes = Array.from(outlet.childNodes).map((n) => document.importNode(n, true))
  return { nodes, title, moduleSrcs }
}

/** Import the modules in `srcs` not already loaded; records them as loaded. */
export async function loadNewModules(state: RouterState, srcs: string[]): Promise<void> {
  const fresh = srcs.filter((s) => !state.loadedModules.has(s))
  await Promise.all(
    fresh.map(async (src) => {
      state.loadedModules.add(src) // mark first so a concurrent nav won't re-import
      try {
        await state.loadModule(src)
      } catch {
        // Un-mark on failure so a later navigation retries (a transient
        // module-load failure shouldn't leave the island inert forever). Not
        // a retry storm: loadNewModules only runs once per navigation.
        state.loadedModules.delete(src)
      }
    }),
  )
}
