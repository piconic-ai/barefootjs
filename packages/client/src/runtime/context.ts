/**
 * Context API: DOM-bound runtime portion.
 *
 * `useContext` and `provideContext` walk the DOM (scope-based) to locate
 * the nearest provider. Portal elements (with bf-po attribute) follow
 * the logical owner chain.
 *
 * A global store is kept as a fallback for non-scoped usage.
 */

import { BF_PORTAL_OWNER, BF_SCOPE, BF_CHILD_PREFIX } from '@barefootjs/shared'
import type { Context } from '../context'

export { createContext, type Context } from '../context'

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
 * Template-scope counter. Incremented on entry to any template evaluation
 * (render, renderChild, insert branch templates), decremented on exit.
 *
 * Templates may run BEFORE the parent's init has called `provideContext`:
 * the compiler inlines `useContext(Ctx)`-derived expressions into the
 * template literal, but `provideContext(Ctx, ...)` lives in init which
 * runs after the template returns its HTML. While `inTemplateScope > 0`,
 * a `useContext` call with no provider and no default returns `undefined`
 * silently instead of throwing — init's `createEffect` repaints with the
 * correct value once the provider is set up. See piconic-ai/barefootjs#1156.
 */
let inTemplateScope = 0

export function enterTemplateScope(): void {
  inTemplateScope++
}

export function exitTemplateScope(): void {
  if (inTemplateScope > 0) inTemplateScope--
}

/**
 * Read the current value of a context.
 *
 * Walks up the DOM tree from the current scope element to find
 * the nearest ancestor that provided this context. Falls back to
 * the global store, then to the context's default value.
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
        const ownerEl: Element | null = document.querySelector(`[${BF_SCOPE}="${BF_CHILD_PREFIX}${portalOwnerId}"], [${BF_SCOPE}="${portalOwnerId}"]`)
        if (ownerEl && ownerEl !== el) {
          el = ownerEl
          continue
        }
      }
      el = el.parentElement
    }
  }
  // Fallback to global store
  if (contextStore.has(context.id)) {
    return contextStore.get(context.id) as T
  }
  if (context._hasDefault) {
    return context.defaultValue as T
  }
  if (inTemplateScope > 0) {
    // Template eval ran before init's provideContext call.
    // Return undefined; init's createEffect repaints with the real value.
    return undefined as T
  }
  throw new Error('useContext: no provider found and no default value')
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
