/**
 * BarefootJS - Portal Utility
 *
 * Client-side utility to mount elements at arbitrary DOM positions.
 * Typically used for modals, tooltips, and other overlay UI.
 *
 * API inspired by React's createPortal(children, domNode).
 */

import { BF_SCOPE, BF_PORTAL_ID, BF_PORTAL_OWNER, BF_PORTAL_PLACEHOLDER, BF_CHILD_PREFIX } from './attrs'
import { parseHTML } from './component'
import { getPortalScopeId } from './scope'

export type Portal = {
  /** The mounted element */
  element: HTMLElement
  /** Remove the mounted element from the DOM */
  unmount: () => void
}

/**
 * Options for createPortal
 */
export interface PortalOptions {
  /**
   * The scope element that owns this portal.
   * When provided, the portal element will have a bf-po attribute
   * set to the scope ID, allowing find() to locate elements inside the portal.
   */
  ownerScope?: Element
}

/** Anything that can be converted to HTML string via toString() */
export type Renderable = { toString(): string }

/** Valid children types for createPortal */
export type PortalChildren = HTMLElement | string | Renderable

/**
 * Create a portal to mount an element at a specific container
 *
 * Similar to React's createPortal(children, domNode), this function
 * mounts the given element/HTML to the specified container.
 *
 * @param children - Element to mount (HTMLElement, HTML string, or JSX.Element)
 * @param container - Target container element (defaults to document.body)
 * @param options - Optional configuration including ownerScope for scope-based find()
 * @returns Portal object with element reference and unmount method
 *
 * @example
 * // With HTML string
 * const portal = createPortal(`
 *   <div class="modal-overlay">
 *     <div class="modal" role="dialog" aria-modal="true">
 *       Modal content
 *     </div>
 *   </div>
 * `, document.body)
 *
 * // With HTMLElement
 * const modalEl = document.createElement('div')
 * modalEl.className = 'modal'
 * const portal = createPortal(modalEl, document.body)
 *
 * // With JSX.Element (Hono)
 * const portal = createPortal(<Modal />, document.body)
 *
 * // With ownerScope for scope-based element detection
 * const portal = createPortal(modalEl, document.body, { ownerScope: scopeElement })
 *
 * // Access the mounted element
 * console.log(portal.element)
 *
 * // Later: unmount
 * portal.unmount()
 */
/**
 * Check if an element is inside an SSR-rendered portal.
 * SSR portals are marked with bf-pi attribute.
 *
 * @param element - Element to check
 * @returns true if element is inside an SSR portal
 */
export function isSSRPortal(element: HTMLElement): boolean {
  return element.closest(`[${BF_PORTAL_ID}]`) !== null
}

/**
 * Remove a portal placeholder element (used after hydration).
 * SSR Portal renders a <template bf-pp="..."> as a marker.
 *
 * @param portalId - The portal ID to find and remove
 */
/**
 * Find a sibling slot element relative to the given element.
 * Handles the SSR portal case where the element is inside a portal wrapper
 * (bf-pi) instead of its original parent container.
 *
 * @param el - Element to search from
 * @param slotSelector - CSS selector for the sibling slot (e.g., '[data-slot="popover-trigger"]')
 * @returns The found element, or null
 */
export function findSiblingSlot(el: HTMLElement, slotSelector: string): HTMLElement | null {
  // Direct parent lookup (normal case)
  const direct = el.parentElement?.querySelector(slotSelector) as HTMLElement | null
  if (direct) return direct

  // SSR portal fallback: use bf-po (owner scope ID) to find the original container
  const portalWrapper = el.closest(`[${BF_PORTAL_ID}]`)
  if (!portalWrapper) return null

  const ownerScopeId = portalWrapper.getAttribute(BF_PORTAL_OWNER)
  if (!ownerScopeId) return null

  // Find owner scope element, trying both direct and child-prefix patterns
  const ownerScope = document.querySelector(`[${BF_SCOPE}="${ownerScopeId}"]`)
    ?? document.querySelector(`[${BF_SCOPE}="${BF_CHILD_PREFIX}${ownerScopeId}"]`)
  if (!ownerScope) return null

  return ownerScope.querySelector(slotSelector) as HTMLElement | null
}

export function cleanupPortalPlaceholder(portalId: string): void {
  const placeholder = document.querySelector(
    `template[${BF_PORTAL_PLACEHOLDER}="${portalId}"]`
  )
  placeholder?.remove()
}

export function createPortal(
  children: PortalChildren,
  container: HTMLElement = document.body,
  options?: PortalOptions
): Portal {
  let element: HTMLElement

  if (children instanceof HTMLElement) {
    element = children
  } else {
    // Convert to string (handles both string and Renderable)
    const html = typeof children === 'string' ? children : children.toString()

    const parsed = parseHTML(html).firstElementChild as HTMLElement

    if (!parsed) {
      throw new Error('createPortal: Invalid HTML provided')
    }

    element = parsed
  }

  // Set portal owner for scope-based find()
  if (options?.ownerScope) {
    // Check bf-s attribute first, then fall back to comment scope registry
    const raw = (options.ownerScope as HTMLElement).getAttribute?.(BF_SCOPE)
    let scopeId = raw?.startsWith(BF_CHILD_PREFIX) ? raw.slice(1) : raw
    if (!scopeId) {
      scopeId = getPortalScopeId(options.ownerScope) ?? null
    }
    if (scopeId) {
      element.setAttribute(BF_PORTAL_OWNER, scopeId)
    }
  }

  container.appendChild(element)

  return {
    element,
    unmount(): void {
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
    }
  }
}
