/**
 * Context API: DOM-bound runtime portion.
 *
 * `useContext` and `provideContext` walk the DOM (scope-based) to locate
 * the nearest provider. Portal elements (with bf-po attribute) follow
 * the logical owner chain.
 *
 * A global store is kept as a fallback for non-scoped usage.
 */

import { BF_HOST, BF_PORTAL_OWNER, BF_SCOPE } from '@barefootjs/shared'
import type { Context } from '../context.ts'
import { resolveScopeElement } from './scope.ts'

export { createContext, type Context } from '../context.ts'

/** Global fallback store for contexts without a DOM scope. */
const contextStore = new Map<symbol, unknown>()

/** Property key for context data stored on DOM elements. */
const CONTEXT_KEY = '__bfCtx'

/** Current scope element, set by initChild during component initialization. */
let currentScope: Element | null = null

/**
 * Set the current scope element for context operations.
 * Called by initChild to scope provideContext/useContext to the correct element.
 * Returns the previous scope for restoration.
 */
export function setCurrentScope(scope: Element | null): Element | null {
  const prev = currentScope
  currentScope = scope
  return prev
}

/**
 * Read the current value of a context.
 *
 * Walks up the DOM tree from the current scope element to find
 * the nearest ancestor that provided this context. Falls back to
 * the global store, then to the context's default value, then to
 * `undefined`.
 *
 * Returning `undefined` (rather than throwing) when no provider is
 * available lets templates evaluate safely before init has run
 * `provideContext` — init's `createEffect` repaints once the
 * provider is set up. See piconic-ai/barefootjs#1156.
 */
export function useContext<T>(context: Context<T>): T {
  // Walk DOM ancestors from current scope to find nearest provider.
  // For portal elements (bf-po attribute), follow the logical owner
  // chain back to the original parent scope.
  if (currentScope) {
    let el: Element | null = currentScope
    while (el) {
      const ctxMap = (el as any)[CONTEXT_KEY] as Map<symbol, unknown> | undefined
      if (ctxMap?.has(context.id)) {
        return ctxMap.get(context.id) as T
      }
      // Follow portal owner chain: if this element has bf-po, jump to the owner scope
      const portalOwnerId: string | null = el.getAttribute(BF_PORTAL_OWNER)
      if (portalOwnerId) {
        const ownerEl: Element | null = resolveScopeElement(portalOwnerId)
        if (ownerEl && ownerEl !== el) {
          el = ownerEl
          continue
        }
      }
      // Self-owner portal case: `el` is itself a component (carries its
      // own bf-s), so a plain `.closest('[bf-s]')` computed by the caller
      // before the portal move resolves to `el` ITSELF, and the caller
      // stamps that self-referential id as `bf-po` — the `ownerEl !== el`
      // guard above correctly refuses to "jump" to itself, but that also
      // means bf-po can never locate the true provider for this shape.
      // `bf-h` doesn't have this problem: it names the host scope this
      // element was upserted FROM (set once, at upsert time, before any
      // portal move) and is never self-referential — the framework's own
      // (bf-h, bf-m) slot-identity invariant guarantees a `bf-h` value
      // always names an ancestor, never the element carrying it. Once a
      // portal move has detached `el` from that ancestor's DOM subtree,
      // this is the only marker left that still points at it correctly,
      // so it's tried whether or not bf-po helped. (#3059 follow-up:
      // multiple NavigationMenu/Menubar/ContextMenu instances on one
      // `site/ui` reference page were observed sharing ONE instance's
      // open/active state, because every affected Content's DOM-ancestor
      // walk fell through this exact self-owner gap straight to the
      // global `contextStore` fallback below — which holds whichever
      // instance's provider registered there most recently, not this
      // consumer's own.)
      const hostId: string | null = el.getAttribute(BF_HOST)
      if (hostId) {
        const hostEl: Element | null = resolveScopeElement(hostId)
        if (hostEl && hostEl !== el) {
          el = hostEl
          continue
        }
      }
      el = el.parentElement
    }
  }
  if (contextStore.has(context.id)) {
    return contextStore.get(context.id) as T
  }
  return context.defaultValue as T
}

/**
 * Provide a value for a context.
 *
 * Stores the value on the current scope DOM element so that child
 * components can find it via useContext's DOM ancestor walk.
 * Also sets the global store as fallback.
 */
export function provideContext<T>(context: Context<T>, value: T): void {
  if (currentScope) {
    let ctxMap = (currentScope as any)[CONTEXT_KEY] as Map<symbol, unknown> | undefined
    if (!ctxMap) {
      ctxMap = new Map()
      ;(currentScope as any)[CONTEXT_KEY] = ctxMap
    }
    ctxMap.set(context.id, value)

    // Propagate context to child scope elements so portal-moved children
    // can find it via DOM ancestor walk. At provideContext time, children
    // are still in their original SSR positions (portals haven't moved them yet).
    const childScopes = currentScope.querySelectorAll(`[${BF_SCOPE}]`)
    for (const child of childScopes) {
      let childCtxMap = (child as any)[CONTEXT_KEY] as Map<symbol, unknown> | undefined
      if (!childCtxMap) {
        childCtxMap = new Map()
        ;(child as any)[CONTEXT_KEY] = childCtxMap
      }
      // Only set if not already provided (don't override nested providers)
      if (!childCtxMap.has(context.id)) {
        childCtxMap.set(context.id, value)
      }
    }
  }
  contextStore.set(context.id, value)
}
