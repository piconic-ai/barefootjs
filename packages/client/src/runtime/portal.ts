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
 * A portal whose deferral subject (see `createPortal`'s insertion rule) was
 * not yet in the document when `createPortal` ran (#2717). Its element is
 * ALREADY a child of `container`; once the subject connects it is
 * re-appended, which moves it to the container's end.
 */
interface PendingPortal {
  element: HTMLElement
  container: HTMLElement
  /** The node whose connection is awaited: the owner, or the element's former parent. */
  subject: Node
}

/** Creation-ordered queue of portals waiting for their subject to connect. */
const pendingPortals: PendingPortal[] = []
/** Alive only while `pendingPortals` is non-empty. */
let pendingObserver: MutationObserver | null = null

/**
 * `Element.moveBefore()` — not yet in TS's bundled `lib.dom.d.ts` — moves an
 * already-connected node without the side effects `appendChild`/
 * `insertBefore` are specified to have on one: it resets `<iframe>` load
 * state, `<video>`/`<audio>` playback position, CSS animation/transition
 * state, `:focus`/`:active`, and native `popover`/fullscreen state. The
 * reorder below is a genuine move of an already-connected node (the
 * element is already `container`'s child from `createPortal`'s initial
 * append), so it must prefer `moveBefore` and fall back to `appendChild`
 * only where the API isn't supported yet — same fallback shape as the
 * `MutationObserver` feature-detection above.
 */
interface MoveBeforeCapable {
  moveBefore(node: Node, child: Node | null): void
}

/** Move `element` to `container`'s end, preserving any live state a plain re-`appendChild` would reset (see `MoveBeforeCapable`). */
function moveToContainerEnd(container: HTMLElement, element: HTMLElement): void {
  const moveBefore = (container as Partial<MoveBeforeCapable>).moveBefore
  if (typeof moveBefore === 'function') {
    moveBefore.call(container, element, null)
  } else {
    container.appendChild(element)
  }
}

/**
 * Re-append every pending portal whose subject has connected since the
 * last check, in creation order — the same order the hydration path
 * produces when the owner is already connected and each `createPortal`
 * appends synchronously. The element is already in `container`, so this
 * moves the connected node to the container's end (see `moveToContainerEnd`),
 * after the root that connected it, rather than inserting a new one.
 * Pending entries whose subject is still detached are kept; an entry
 * whose element has left the container in the meantime (removed or moved
 * by the caller without `unmount`) is dropped rather than re-inserted.
 */
function flushPendingPortals(): void {
  for (const pending of pendingPortals.slice()) {
    if (!pending.subject.isConnected) continue
    pendingPortals.splice(pendingPortals.indexOf(pending), 1)
    if (pending.element.parentNode === pending.container) {
      moveToContainerEnd(pending.container, pending.element)
    }
  }
  if (pendingPortals.length === 0 && pendingObserver) {
    pendingObserver.disconnect()
    pendingObserver = null
  }
}

function enqueuePendingPortal(pending: PendingPortal): void {
  pendingPortals.push(pending)
  if (!pendingObserver) {
    // Observe the whole document: the subject is connected by whoever holds
    // the component root (`document.body.appendChild(root)` in a CSR boot,
    // a placeholder `replaceWith` higher up the tree, …) — the runtime has
    // no hook of its own at that moment, so the DOM's own insertion
    // notification is the one signal that covers every caller. Callbacks
    // run as a microtask, before the next paint, so the element is never
    // rendered at its pre-reorder position.
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
 * synchronously, at call time, and — when the component it belongs to is
 * not yet in the document — re-appended once that component connects,
 * which moves it to the container's end.
 *
 * - Owner already connected (hydration: SSR markup is in the document
 *   before `init` runs), or nothing to wait for: a single append, at the
 *   container's end — unchanged behaviour.
 * - Owner not yet connected (a client-side mount: `materializeComponent`
 *   runs `init` — and so the `ref` callbacks that call this — BEFORE the
 *   bare-`createComponent` caller connects the root): the element is
 *   appended now all the same, and a reorder is queued; once the owner
 *   connects, pending portals are re-appended in creation order.
 *
 * Without the reorder the two construction paths disagree on
 * `document.body`'s child order: hydration yields `[root, …portals]`
 * while a CSR mount yields `[…portals, root]`, because the root is
 * appended AFTER its portals were. Child order is user-visible (paint
 * order between equal-`z-index` overlays, focus traversal, `querySelector`
 * results), so both paths converge on the hydration answer.
 *
 * The append itself is never deferred: the element is connected to the
 * document at every point in time, only its position among the
 * container's children settles asynchronously (as a microtask, before the
 * next paint). Portal consumers measure layout synchronously in the same
 * tick as their `ref` callback — `createEffect`'s first run is synchronous,
 * and the floating-position components (popover, dropdown-menu, context-
 * menu, …) read `offsetWidth`/`offsetHeight` of the portaled element there,
 * gated only on their open signal — so a portal that was briefly absent
 * from the document would hand them zero-sized boxes with nothing to
 * re-trigger the measurement once it landed.
 *
 * The subject whose connection is awaited is the `ownerScope` when given
 * and it lies outside the element; otherwise the element's former parent.
 * The self-owner shape (`ownerScope === element`: a child component whose
 * own root carries `bf-s`, e.g. DialogOverlay/DialogContent) needs that
 * fallback, since the immediate append connects the element — and so the
 * owner — right away, while the component under construction is the tree
 * it was taken from. An element in a detached tree with no owner (a
 * fragment-root component, whose scope lives on a comment) is the same
 * case. A bare element with neither has nothing that will ever connect
 * it, so there is nothing to wait for.
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

  // The reorder subject, resolved BEFORE the append moves the element:
  // the declared owner when it lies outside the element, else the
  // element's former parent (see the insertion rule above). Only a parent
  // the caller handed us counts — the string path parses into a fragment,
  // which never connects; the same goes for a caller-built fragment.
  const owner = options?.ownerScope
  const formerParent = children instanceof HTMLElement ? children.parentNode : null
  const subject: Node | null =
    owner && !element.contains(owner) ? owner : formerParent instanceof Element ? formerParent : null

  container.appendChild(element)

  // `MutationObserver` is the reorder primitive; an environment without it
  // keeps the plain synchronous append (the pre-#2717 behaviour).
  if (subject && !subject.isConnected && typeof MutationObserver !== 'undefined') {
    enqueuePendingPortal({ element, container, subject })
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
