/**
 * Bridges to the client runtime, kept behind `window.*` seams so the router
 * core never hard-depends on `@barefootjs/client` (it's an optional peer).
 */

interface ClientSeams {
  __bf_hydrate_within?: (root: Element) => void
  __bf_dispose_within?: (root: Element) => void
  __bf_hydrate?: () => void
  __bf_set_search?: (search: string) => void
}

/**
 * Drive the `searchParams()` signal if `@barefootjs/router/signals` is loaded
 * (it sets `window.__bf_set_search`). Returns `true` when the seam exists, so
 * the caller knows searchParams is in use.
 */
export function setSearchSeam(search: string): boolean {
  const w = window as unknown as ClientSeams
  if (typeof w.__bf_set_search !== 'function') return false
  w.__bf_set_search(search)
  return true
}

/** Re-hydrate the swapped outlet — subtree-scoped when the runtime exposes it. */
export async function defaultRehydrate(outlet: Element): Promise<void> {
  const w = window as unknown as ClientSeams
  // Prefer the subtree-scoped walk — O(outlet), not O(document).
  if (typeof w.__bf_hydrate_within === 'function') {
    w.__bf_hydrate_within(outlet)
    return
  }
  if (typeof w.__bf_hydrate === 'function') {
    w.__bf_hydrate()
    return
  }
  // Fall back to the runtime's named exports. Variable specifier keeps the
  // client an optional peer (no static type/bundle dependency); the browser
  // resolves the bare specifier through the page's import map.
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as {
      rehydrateScope?: (root: Element) => void
      rehydrateAll?: () => void
    }
    if (mod.rehydrateScope) mod.rehydrateScope(outlet)
    else mod.rehydrateAll?.()
  } catch {
    // No client runtime on the page (static shell) — nothing to hydrate.
  }
}

/** Dispose the outgoing islands precisely when the runtime exposes it. */
export async function defaultDispose(outlet: Element): Promise<void> {
  const w = window as unknown as ClientSeams
  if (typeof w.__bf_dispose_within === 'function') {
    w.__bf_dispose_within(outlet)
    return
  }
  // Match re-hydration's optional-runtime fallback so missing streaming
  // seams do not silently leak effects owned by the outgoing outlet.
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as { disposeScope?: (root: Element) => void }
    mod.disposeScope?.(outlet)
  } catch {
    // No client runtime on the page (static shell) — nothing to dispose.
  }
}

/** Fall back to a full browser navigation. */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}
