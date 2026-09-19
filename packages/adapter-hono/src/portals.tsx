// @jsxRuntime automatic
// @jsxImportSource hono/jsx
//
// Pragmas as line-comments above the JSDoc; see scripts.tsx for the rationale.

/**
 * BfPortals Component
 *
 * Renders collected portal content at the end of the document body.
 * BarefootJS Portal components collect their content during SSR render,
 * and this component outputs them all at once to ensure correct positioning.
 *
 * Usage:
 * ```tsx
 * import { BfPortals } from '@barefootjs/hono'
 *
 * <html>
 *   <body>
 *     {children}
 *     <BfPortals />
 *     <BfScripts />
 *   </body>
 * </html>
 * ```
 */

import { useRequestContext } from 'hono/jsx-renderer'
import { Fragment } from 'hono/jsx'
import type { Child } from 'hono/jsx'

export type CollectedPortal = {
  id: string
  scopeId: string
  content: Child
}

/**
 * Collect portal content for SSR output.
 * Called by Portal component during SSR rendering.
 */
export function collectPortal(id: string, scopeId: string, content: Child): void {
  try {
    const c = useRequestContext()
    const portals: CollectedPortal[] = c.get('bfCollectedPortals') || []
    portals.push({ id, scopeId, content })
    c.set('bfCollectedPortals', portals)
  } catch {
    // Outside request context (client-side) - no-op
  }
}

/**
 * Check if BfPortals has already been rendered.
 * Used by Portal component to determine if it should output inline.
 */
export function isPortalsRendered(): boolean {
  try {
    const c = useRequestContext()
    return c.get('bfPortalsRendered') ?? false
  } catch {
    // Outside request context (client-side)
    return true
  }
}

/**
 * Collect a single already-hydration-marked element for SSR output at the
 * `<BfPortals />` outlet (#3059) — the compiler's `ref`-callback SSR-portal
 * pattern (`ssrPortalOwnerScope`, see `isSsrPortalRefCallback` in
 * `@barefootjs/jsx`), NOT the explicit `<Portal>` component's `collectPortal`
 * above.
 *
 * Unlike `collectPortal`, which wraps arbitrary `children` in its own
 * `bf-pi`/`bf-po` container div (needed because `children` may not be a
 * single element), `content` here is the ONE element the compiler already
 * rendered with `bf-po` set directly on its own tag — matching exactly what
 * the client `createPortal(el, document.body, { ownerScope })` stamps onto
 * the SAME element at hydrate time (no wrapper). So this collects `content`
 * unwrapped, and `BfPortals` places it at the outlet as-is.
 *
 * Returns the JSX to render AT THE CALL SITE (its ORIGINAL, inline
 * position): `null` once collected — the element then appears only at the
 * outlet — or `content` itself when there's nowhere to collect it into (no
 * `jsxRenderer` context, or `BfPortals` already rendered, e.g. inside a
 * Suspense boundary) so the element still reaches the page.
 */
export function collectSsrPortalElement(scopeId: string, content: Child): Child {
  try {
    const c = useRequestContext()
    if (isPortalsRendered()) return content
    const elements: Child[] = c.get('bfCollectedPortalElements') || []
    elements.push(content)
    c.set('bfCollectedPortalElements', elements)
    return null
  } catch {
    // Outside request context (client-side rendering, or no jsxRenderer
    // middleware) — nothing to collect into, so render inline as before.
    return content
  }
}

/**
 * Renders all collected portal content.
 * Place this component at the end of your <body> element, before BfScripts.
 *
 * After rendering, sets 'bfPortalsRendered' flag to true.
 * Portal components rendered after BfPortals (e.g., inside Suspense boundaries)
 * will check this flag and output their content inline instead.
 */
export function BfPortals() {
  try {
    const c = useRequestContext()

    // Mark that BfPortals has been rendered.
    // Portal components rendered after this point (e.g., inside Suspense)
    // should output their content inline.
    c.set('bfPortalsRendered', true)

    const portals: CollectedPortal[] = c.get('bfCollectedPortals') || []
    const elements: Child[] = c.get('bfCollectedPortalElements') || []

    return (
      <Fragment>
        {portals.map(({ id, scopeId, content }) => (
          <div key={id} bf-pi={id} bf-po={scopeId}>
            {content}
          </div>
        ))}
        {elements.map((content, i) => (
          <Fragment key={`e${i}`}>{content}</Fragment>
        ))}
      </Fragment>
    )
  } catch {
    // Context unavailable (e.g., not using jsxRenderer)
    return null
  }
}
