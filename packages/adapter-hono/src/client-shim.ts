/**
 * SSR shim for `@barefootjs/client` when targeting the Hono adapter.
 *
 * The compiler rewrites `@barefootjs/client` imports inside SSR templates to
 * this module. The shim provides:
 *
 *   - `useContext` / `provideContext` bridged to Hono's per-render context
 *     stack, so context values flow through `<Context.Provider value=...>`
 *     during SSR. The compiler emits provider IR via `provideContextSSR`.
 *   - Pure helpers (`createContext`, `splitProps`, `forwardProps`, `unwrap`,
 *     `__slot`) re-exported from `@barefootjs/client`.
 *   - Reactive primitives (`createSignal`, `createMemo`, etc.) replaced with
 *     stubs that throw if called — the compiler is expected to rewrite all
 *     reachable call sites to plain values during SSR codegen.
 *   - Portal helpers as no-ops; portals are realized at hydration time.
 */

/** @jsxImportSource hono/jsx */

import { createContext as honoCreateContext, useContext as honoUseContext, jsx } from 'hono/jsx'
import type { Context as HonoContext } from 'hono/jsx'
import type { Context } from '@barefootjs/client'

export {
  createContext,
  splitProps,
  forwardProps,
  unwrap,
  __slot,
} from '@barefootjs/client'

export type {
  Context,
  Reactive,
  Signal,
  Memo,
  CleanupFn,
  EffectFn,
  SlotMarker,
  Portal,
  PortalChildren,
  PortalOptions,
  Renderable,
} from '@barefootjs/client'

// ---------------------------------------------------------------------------
// Context bridge: BarefootJS Context → Hono Context
// ---------------------------------------------------------------------------

const honoCtxBridge = new WeakMap<Context<unknown>, HonoContext<unknown>>()

/**
 * Lazily map a BarefootJS Context object to a Hono context. The mapping is
 * stable (WeakMap keyed by the Context object itself), so providers and
 * consumers in the same render see the same Hono context.
 */
export function getHonoContext<T>(bfCtx: Context<T>): HonoContext<T | undefined> {
  let hc = honoCtxBridge.get(bfCtx as Context<unknown>) as HonoContext<T | undefined> | undefined
  if (!hc) {
    hc = honoCreateContext<T | undefined>(bfCtx.defaultValue)
    honoCtxBridge.set(bfCtx as Context<unknown>, hc as HonoContext<unknown>)
  }
  return hc
}

/**
 * SSR `useContext`: read from Hono's per-render stack, falling back to the
 * BarefootJS Context's default value, then to `undefined`. Mirrors client
 * semantics — no provider returns `undefined` rather than throwing.
 */
export function useContext<T>(bfCtx: Context<T>): T {
  const hc = getHonoContext(bfCtx)
  const v = honoUseContext(hc) as T | undefined
  if (v !== undefined) return v
  return bfCtx.defaultValue as T
}

/**
 * SSR `provideContext`: imperative provider calls inside init code are
 * unreachable from SSR templates (they live in client JS). At SSR, the
 * `<Context.Provider value=...>` JSX is compiled to `provideContextSSR`
 * instead, which uses Hono's stack-scoped Provider.
 */
export function provideContext<T>(_bfCtx: Context<T>, _value: T): void {
  // intentional no-op
}

/**
 * Compiler-emitted helper for `<Context.Provider value=...>{children}</...>`
 * at SSR. Wraps children with the bridged Hono Provider so that descendants
 * resolving the same BarefootJS Context via `useContext` see this value.
 */
export function provideContextSSR<T>(
  bfCtx: Context<T>,
  value: T,
  children: unknown,
): unknown {
  const HonoCtx = getHonoContext(bfCtx)
  return jsx(HonoCtx.Provider as unknown as Function, { value, children })
}

// ---------------------------------------------------------------------------
// Reactive primitives — never reached at SSR (compiler rewrites call sites)
// ---------------------------------------------------------------------------

function calledAtSSR(name: string): never {
  throw new Error(
    `[barefootjs] ${name}() reached SSR. The compiler should have rewritten this call site — please report a bug.`,
  )
}

export function createSignal<T>(_initial?: T): never {
  return calledAtSSR('createSignal')
}
export function createMemo<T>(_fn: () => T): never {
  return calledAtSSR('createMemo')
}
export function createEffect(_fn: () => void): never {
  return calledAtSSR('createEffect')
}
export function createDisposableEffect(_fn: () => void): never {
  return calledAtSSR('createDisposableEffect')
}
export function createRoot<T>(_fn: (dispose: () => void) => T): never {
  return calledAtSSR('createRoot')
}

export function onMount(_fn: () => void): void {
  // no-op at SSR
}
export function onCleanup(_fn: () => void): void {
  // no-op at SSR
}

export function untrack<T>(fn: () => T): T {
  return fn()
}
export function batch<T>(fn: () => T): T {
  return fn()
}

// ---------------------------------------------------------------------------
// Portal stubs — portals are realized at hydration time, not at SSR
// ---------------------------------------------------------------------------

export function createPortal(
  _children: unknown,
  _container?: unknown,
  _options?: unknown,
): never {
  return calledAtSSR('createPortal')
}

export function isSSRPortal(_element: unknown): boolean {
  return false
}

export function findSiblingSlot(_el: unknown, _slotSelector: string): null {
  return null
}

export function cleanupPortalPlaceholder(_portalId: string): void {
  // no-op
}
