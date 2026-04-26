/**
 * Portal Component for SSR
 *
 * Renders children to document.body during SSR via BfPortals collection.
 * On client-side, renders children normally (to be moved by createPortal).
 *
 * Usage:
 * ```tsx
 * import { Portal } from '@barefootjs/hono'
 *
 * function MyDialog({ scopeId }: { scopeId: string }) {
 *   return (
 *     <Portal scopeId={scopeId}>
 *       <div class="dialog">Dialog content</div>
 *     </Portal>
 *   )
 * }
 * ```
 */

/** @jsxImportSource hono/jsx */

import { useRequestContext } from 'hono/jsx-renderer'
import { Fragment } from 'hono/jsx'
import type { Child } from 'hono/jsx'
import { collectPortal, isPortalsRendered } from './portals'

let portalCounter = 0

/**
 * Generate unique portal ID for SSR/hydration matching.
 * Counter resets per request in production (new context per request).
 */
function generatePortalId(): string {
  return `bf-portal-${++portalCounter}`
}

/**
 * Reset portal counter (for testing or explicit reset).
 */
export function resetPortalCounter(): void {
  portalCounter = 0
}

export interface PortalProps {
  children: Child
  scopeId?: string
}

/**
 * Portal component that moves children to document.body during SSR.
 *
 * During SSR:
 * - Collects content for BfPortals output (before BfPortals renders)
 * - Returns placeholder <template> for hydration matching
 * - If BfPortals already rendered (Suspense), outputs inline
 *
 * On client:
 * - Renders children normally (createPortal moves them later)
 */
export function Portal(props: PortalProps) {
  const portalId = generatePortalId()

  try {
    // Check if we're in SSR context (will throw if not)
    useRequestContext()

    if (isPortalsRendered()) {
      // BfPortals already rendered (e.g., inside Suspense boundary)
      // Output portal content inline
      return (
        <div bf-pi={portalId} bf-po={props.scopeId || ''}>
          {props.children}
        </div>
      )
    }

    // Collect portal content for BfPortals output
    collectPortal(portalId, props.scopeId || '', props.children)

    // Return placeholder for hydration matching
    // Client will find this and know the portal content is at body end
    return <template bf-pp={portalId} />
  } catch {
    // Outside request context (client-side rendering)
    // Render children normally - they will be moved by createPortal on mount
    return <Fragment>{props.children}</Fragment>
  }
}
