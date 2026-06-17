/**
 * Window bridges to the optional `@barefootjs/client` runtime.
 *
 * The router core never statically imports `@barefootjs/client` — that keeps it
 * an *optional* peer, so a static-shell site ships the router with zero client
 * runtime. Every coupling lives here, and every coupling is correct by default:
 * `dispose`/`rehydrate` degrade through the SAME fallback chain ending at
 * `@barefootjs/client/runtime`, and neither silently no-ops on a page that has
 * islands (spec/router.md "Seams & correctness" — the #1910 `setupStreaming()`
 * footgun, where islands leaked unless the dev opted in, is what this avoids).
 */

import {
  BF_HOST,
  BF_SCOPE,
  BF_SEAM_DISPOSE_WITHIN,
  BF_SEAM_HYDRATE,
  BF_SEAM_HYDRATE_WITHIN,
  BF_SEAM_PUSH_SEARCH,
} from '@barefootjs/shared'

// Seam-name keys come from `@barefootjs/shared` so this reader and the client
// installer can never disagree on a property name (a typo would otherwise just
// fall through to the dynamic-import path and silently change behaviour).
interface ClientSeams {
  /** Subtree-scoped re-hydration (O(region)); installed by the client runtime. */
  [BF_SEAM_HYDRATE_WITHIN]?: (root: Element) => void
  /** Subtree-scoped disposal; installed by the client runtime. */
  [BF_SEAM_DISPOSE_WITHIN]?: (root: Element) => void
  /** Whole-document re-hydration fallback. */
  [BF_SEAM_HYDRATE]?: () => void
  /**
   * Push a new query string into the `searchParams()` env signal
   * (`@barefootjs/client`, v0.5). The router owns popstate/query-only nav and
   * pushes through this seam; the client installs it lazily on first
   * `searchParams()` read, so the client package stays `sideEffects: false`.
   */
  [BF_SEAM_PUSH_SEARCH]?: (search: string) => void
}

/**
 * Push the committed query string into the env signal, if a `searchParams()`
 * consumer has registered the seam. Returns whether the seam exists — the
 * caller uses that boolean to decide query-only-vs-structural navigation.
 */
export function pushSearchSeam(search: string): boolean {
  const w = window as unknown as ClientSeams
  const push = w[BF_SEAM_PUSH_SEARCH]
  if (typeof push !== 'function') return false
  push(search)
  return true
}

export async function defaultRehydrate(region: Element): Promise<void> {
  const w = window as unknown as ClientSeams
  // Prefer the subtree-scoped walk — O(region), not O(document).
  const hydrateWithin = w[BF_SEAM_HYDRATE_WITHIN]
  if (typeof hydrateWithin === 'function') {
    hydrateWithin(region)
    return
  }
  const hydrateAll = w[BF_SEAM_HYDRATE]
  if (typeof hydrateAll === 'function') {
    hydrateAll()
    return
  }
  // Fall back to the runtime's named exports. The specifier is a *variable* so
  // bundlers can't statically resolve (and thus bundle) the optional peer; the
  // browser resolves the bare specifier through the page's import map.
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as {
      rehydrateScope?: (root: Element) => void
      rehydrateAll?: () => void
    }
    if (mod.rehydrateScope) mod.rehydrateScope(region)
    else mod.rehydrateAll?.()
  } catch {
    // A region with hydration markers but no reachable runtime is a real
    // failure — the swapped content won't be interactive. Surface it rather
    // than silently no-op (spec/router.md "Neither may silently no-op"). A
    // static shell (no markers) genuinely has nothing to do, so stays quiet.
    warnIfIslandsUnreachable(region, 're-hydrate')
  }
}

export async function defaultDispose(region: Element): Promise<void> {
  const w = window as unknown as ClientSeams
  const disposeWithin = w[BF_SEAM_DISPOSE_WITHIN]
  if (typeof disposeWithin === 'function') {
    disposeWithin(region)
    return
  }
  try {
    const spec = '@barefootjs/client/runtime'
    const mod = (await import(spec)) as { disposeScope?: (root: Element) => void }
    mod.disposeScope?.(region)
  } catch {
    // Same as re-hydrate: a no-op dispose on a region that has islands leaks
    // their handlers/effects across the navigation — surface it.
    warnIfIslandsUnreachable(region, 'dispose')
  }
}

/**
 * Does the region contain BarefootJS hydration markers (`bf-s` scope roots or
 * `bf-h` child-scope hosts)? If so, the client runtime *should* be on the page,
 * and failing to reach it is an error worth surfacing — not the silent
 * "static shell" path.
 */
export function regionHasIslands(region: Element): boolean {
  return (
    region.hasAttribute(BF_SCOPE) ||
    region.hasAttribute(BF_HOST) ||
    region.querySelector(`[${BF_SCOPE}],[${BF_HOST}]`) !== null
  )
}

function warnIfIslandsUnreachable(region: Element, op: 'dispose' | 're-hydrate'): void {
  if (!regionHasIslands(region)) return
  console.error(
    `[barefootjs/router] could not load @barefootjs/client/runtime to ${op} a region that contains islands. ` +
      `The swapped content may leak handlers or not be interactive — ensure the runtime is served and mapped in the page's import map.`,
  )
}

/** Full browser navigation — the "never worse than an MPA" floor. */
export function hardNavigate(url: string): void {
  window.location.assign(url)
}
