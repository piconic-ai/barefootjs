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

export function useContext<T>(_context: Context<T>): T {
  return browserOnly('useContext')
}

export function provideContext<T>(_context: Context<T>, _value: T): void {
  return browserOnly('provideContext')
}

export function createPortal(
  _children: PortalChildren,
  _container?: Element,
  _options?: PortalOptions,
): Portal {
  return browserOnly('createPortal')
}

export function isSSRPortal(_element: HTMLElement): boolean {
  return browserOnly('isSSRPortal')
}

export function findSiblingSlot(
  _el: HTMLElement,
  _slotSelector: string,
): HTMLElement | null {
  return browserOnly('findSiblingSlot')
}

export function cleanupPortalPlaceholder(_portalId: string): void {
  return browserOnly('cleanupPortalPlaceholder')
}
