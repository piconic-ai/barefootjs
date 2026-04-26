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

/** @jsxImportSource hono/jsx */

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

    return (
      <Fragment>
        {portals.map(({ id, scopeId, content }) => (
          <div key={id} bf-pi={id} bf-po={scopeId}>
            {content}
          </div>
        ))}
      </Fragment>
    )
  } catch {
    // Context unavailable (e.g., not using jsxRenderer)
    return null
  }
}
