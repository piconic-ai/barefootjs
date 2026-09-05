/**
 * BarefootJS - Portal Utility
 *
 * Client-side utility to mount elements at arbitrary DOM positions.
 * Typically used for modals, tooltips, and other overlay UI.
 *
 * API inspired by React's createPortal(children, domNode).
 */

import { BF_SCOPE, BF_PORTAL_ID, BF_PORTAL_OWNER, BF_PORTAL_PLACEHOLDER } from '@barefootjs/shared'
import { parseHTML } from './component.ts'
import { getPortalScopeId } from './scope.ts'

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

  // Find owner scope by exact bf-s match (#1249 — no `~` prefix).
  const ownerScope = document.querySelector(`[${BF_SCOPE}="${ownerScopeId}"]`)
  if (!ownerScope) return null

  return ownerScope.querySelector(slotSelector) as HTMLElement | null
}

export function cleanupPortalPlaceholder(portalId: string): void {
  const placeholder = document.querySelector(
    `template[${BF_PORTAL_PLACEHOLDER}="${portalId}"]`
  )
  placeholder?.remove()
}

/**
 * A portal whose `ownerScope` was not yet in the document when `createPortal`
 * ran (#2717). Its element stays wherever it is until the owner connects,
 * then moves to `container` — see `createPortal`'s insertion rule.
 */
interface PendingPortal {
  element: HTMLElement
  container: HTMLElement
  owner: Element
}

/** Creation-ordered queue of portals waiting for their owner to connect. */
const pendingPortals: PendingPortal[] = []
/** Alive only while `pendingPortals` is non-empty. */
let pendingObserver: MutationObserver | null = null

/**
 * Append every pending portal whose owner has connected since the last
 * check, in creation order — the same order the hydration path produces
 * when the owner is already connected and each `createPortal` appends
 * synchronously. Pending entries whose owner is still detached are kept.
 */
function flushPendingPortals(): void {
  for (const pending of pendingPortals.slice()) {
    if (!pending.owner.isConnected) continue
    pendingPortals.splice(pendingPortals.indexOf(pending), 1)
    pending.container.appendChild(pending.element)
  }
  if (pendingPortals.length === 0 && pendingObserver) {
    pendingObserver.disconnect()
    pendingObserver = null
  }
}

function enqueuePendingPortal(pending: PendingPortal): void {
  pendingPortals.push(pending)
  if (!pendingObserver) {
    // Observe the whole document: the owner is connected by whoever holds
    // the component root (`document.body.appendChild(root)` in a CSR boot,
    // a placeholder `replaceWith` higher up the tree, …) — the runtime has
    // no hook of its own at that moment, so the DOM's own insertion
    // notification is the one signal that covers every caller. Callbacks
    // run as a microtask, before the next paint, so the element is never
    // rendered at its pre-portal position.
    pendingObserver = new MutationObserver(flushPendingPortals)
    pendingObserver.observe(document, { childList: true, subtree: true })
  }
}

function cancelPendingPortal(element: HTMLElement): void {
  const idx = pendingPortals.findIndex(p => p.element === element)
  if (idx >= 0) pendingPortals.splice(idx, 1)
  if (pendingPortals.length === 0 && pendingObserver) {
    pendingObserver.disconnect()
    pendingObserver = null
  }
}

/**
 * Insertion rule (#2717): the portal's content is appended to `container`
 * once its `ownerScope` is connected to the document.
 *
 * - Owner already connected (hydration: SSR markup is in the document
 *   before `init` runs), or no `ownerScope` given: appended synchronously,
 *   at the container's end, at call time — unchanged behaviour.
 * - Owner not yet connected (a client-side mount: `materializeComponent`
 *   runs `init` — and so the `ref` callbacks that call this — BEFORE the
 *   bare-`createComponent` caller connects the root): the append is
 *   deferred until the owner connects, and pending portals flush in
 *   creation order.
 *
 * Without the deferral the two construction paths disagree on
 * `document.body`'s child order: hydration yields `[root, …portals]`
 * while a CSR mount yields `[…portals, root]`, because the root is
 * appended AFTER its portals were. Child order is user-visible (paint
 * order between equal-`z-index` overlays, focus traversal, `querySelector`
 * results), so both paths converge on the hydration answer. The subject
 * whose connection is awaited is the `ownerScope` when given, else the
 * element's own (detached) tree when it already sits in one; a bare
 * element with neither has nothing else that will ever connect it, so it
 * must append now.
 */
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
    // Check bf-s attribute first, then fall back to comment scope registry.
    // bf-s is the bare addressable id (#1249), suitable for bf-po as-is.
    let scopeId: string | null = (options.ownerScope as HTMLElement).getAttribute?.(BF_SCOPE) ?? null
    if (!scopeId) {
      scopeId = getPortalScopeId(options.ownerScope) ?? null
    }
    if (scopeId) {
      element.setAttribute(BF_PORTAL_OWNER, scopeId)
    }
  }

  // The deferral subject: the declared owner, or — for an element that
  // already sits in a tree — the element itself (its tree is the component
  // under construction; `el.closest('[bf-s]')` finds no owner for a
  // fragment-root component, whose scope lives on a comment, yet its
  // `ref` callback runs on the same detached tree). A bare element with no
  // parent and no owner has nothing that will ever connect it, so it
  // appends now.
  const owner = options?.ownerScope ?? (children instanceof HTMLElement && children.parentNode ? children : null)
  // `MutationObserver` is the deferral primitive; an environment without
  // it keeps the synchronous append (the pre-#2717 behaviour) rather than
  // losing the portal altogether.
  if (owner && !owner.isConnected && typeof MutationObserver !== 'undefined') {
    enqueuePendingPortal({ element, container, owner })
  } else {
    container.appendChild(element)
  }

  return {
    element,
    unmount(): void {
      cancelPendingPortal(element)
      if (element.parentNode) {
        element.parentNode.removeChild(element)
      }
    }
  }
}
