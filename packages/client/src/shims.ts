/**
 * Browser-only API shims.
 *
 * These functions have real implementations in `./runtime/` that the
 * compiler emits for `'use client'` components. The exports here exist
 * for type-checking in user source files.
 *
 * If one of these ever runs, it means a `'use client'` component was
 * executed without going through the compiler — or a non-client file
 * slipped past the `MISSING_USE_CLIENT` check. Either way, it's a bug.
 */

import type { Context } from './context.ts'
import type { Portal, PortalChildren, PortalOptions } from './runtime/portal.ts'

export type { Portal, PortalChildren, PortalOptions, Renderable } from './runtime/portal.ts'

function browserOnly(name: string): never {
  throw new Error(
    `[barefootjs] ${name}() is a browser-only API and can only be called from a "use client" component. ` +
      `If you are seeing this at runtime, the BarefootJS compiler did not rewrite the import — please report a bug.`,
  )
}

/**
 * Read the nearest provided value for a context. Browser-only; the compiler rewrites the import in `"use client"` components.
 *
 * @example
 * ```tsx
 * "use client"
 * function AccordionContent(props: { children?: unknown }) {
 *   const handleMount = (el: HTMLElement) => {
 *     const ctx = useContext(AccordionItemContext)
 *     createEffect(() => {
 *       el.dataset.state = ctx.open() ? 'open' : 'closed'
 *     })
 *   }
 *   return <div ref={handleMount}>{props.children}</div>
 * }
 * ```
 *
 * @since 0.1.0
 * @stability beta
 */
export function useContext<T>(_context: Context<T>): T {
  return browserOnly('useContext')
}

/**
 * Provide a context value to the current component subtree. Browser-only.
 *
 * @example
 * ```tsx
 * "use client"
 * // Normally written as JSX, which the compiler lowers to this call:
 * //   <TabsContext.Provider value={{ active }}>{props.children}</TabsContext.Provider>
 * provideContext(TabsContext, { active })
 * ```
 *
 * @since 0.1.0
 * @stability beta
 */
export function provideContext<T>(_context: Context<T>, _value: T): void {
  return browserOnly('provideContext')
}

/**
 * Render children into a container outside the parent DOM hierarchy. Browser-only.
 *
 * @example
 * ```tsx
 * "use client"
 * function DialogOverlay() {
 *   const handleMount = (el: HTMLElement) => {
 *     // Move the overlay to <body> so no ancestor's overflow or z-index clips it.
 *     createPortal(el, document.body)
 *   }
 *   return <div ref={handleMount} class="fixed inset-0 bg-black/50" />
 * }
 * ```
 *
 * @since 0.1.0
 * @stability beta
 */
export function createPortal(
  _children: PortalChildren,
  _container?: Element,
  _options?: PortalOptions,
): Portal {
  return browserOnly('createPortal')
}

/**
 * @since 0.1.0
 * @internal
 */
export function isSSRPortal(_element: HTMLElement): boolean {
  return browserOnly('isSSRPortal')
}

/**
 * @since 0.1.0
 * @internal
 */
export function findSiblingSlot(
  _el: HTMLElement,
  _slotSelector: string,
): HTMLElement | null {
  return browserOnly('findSiblingSlot')
}

/**
 * @since 0.1.0
 * @internal
 */
export function cleanupPortalPlaceholder(_portalId: string): void {
  return browserOnly('cleanupPortalPlaceholder')
}

/**
 * Keep a floating element positioned while open: runs `update` now, on capture-phase scroll and on resize, and once more on dispose. Browser-only.
 *
 * @example
 * ```tsx
 * "use client"
 * // Keep an open popover pinned to its trigger while the page scrolls.
 * const dispose = trackPosition(() => {
 *   const r = trigger.getBoundingClientRect()
 *   el.style.top = `${r.bottom + window.scrollY}px`
 * })
 *
 * // When the popover closes: runs `update` once more, then detaches.
 * dispose()
 * ```
 *
 * @since 0.35.0
 * @stability alpha
 */
export function trackPosition(_update: () => void): () => void {
  return browserOnly('trackPosition')
}
