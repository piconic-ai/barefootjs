/**
 * Context API: DOM-bound runtime portion.
 *
 * `useContext` and `provideContext` walk the DOM (scope-based) to locate
 * the nearest provider. Portal elements (with bf-po attribute) follow
 * the logical owner chain.
 *
 * A global store is kept as a fallback for non-scoped usage.
 */

import { BF_SCOPE } from '@barefootjs/shared'
import type { Context } from '../context.ts'
import { logicalHost, relocatedDescendants } from './scope.ts'

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
  // Walk DOM ancestors from current scope to find nearest provider. For a
  // relocated element (SSR-portal outlet placement or a hydrate-time
  // `createPortal`, #3059), `logicalHost` (scope.ts) follows the bf-h/
  // bf-po child-to-host hop back to the scope it was upserted from — the
  // one place this hop is implemented; `relocatedDescendants` uses the
  // same function in the opposite (host-to-child) direction. (#3059
  // follow-up: multiple NavigationMenu/Menubar/ContextMenu instances on
  // one `site/ui` reference page were observed sharing ONE instance's
  // open/active state, because every affected Content's DOM-ancestor walk
  // fell through the self-owner-portal gap this hop closes, straight to
  // the global `contextStore` fallback below — which holds whichever
  // instance's provider registered there most recently, not this
  // consumer's own.)
  if (currentScope) {
    let el: Element | null = currentScope
    while (el) {
      const ctxMap = (el as any)[CONTEXT_KEY] as Map<symbol, unknown> | undefined
      if (ctxMap?.has(context.id)) {
        return ctxMap.get(context.id) as T
      }
      const host = logicalHost(el)
      el = host ?? el.parentElement
    }
  }
  if (contextStore.has(context.id)) {
    return contextStore.get(context.id) as T
  }
  return context.defaultValue as T
}

/** Set `context.id` on `el`'s ctxMap unless it's already provided there
 *  (never override a nested provider). */
function seedContextIfAbsent<T>(el: Element, context: Context<T>, value: T): void {
  let ctxMap = (el as any)[CONTEXT_KEY] as Map<symbol, unknown> | undefined
  if (!ctxMap) {
    ctxMap = new Map()
    ;(el as any)[CONTEXT_KEY] = ctxMap
  }
  if (!ctxMap.has(context.id)) {
    ctxMap.set(context.id, value)
  }
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
    // can find it via useContext's DOM-ancestor walk without needing a
    // bf-h/bf-po jump at all (seeding here beats them to it). For an
    // ELEMENT still in its original SSR position — including any adapter
    // with no SSR-portal outlet, and a plain `createPortal` that hasn't
    // moved yet — this literal descendant walk is enough.
    for (const child of currentScope.querySelectorAll(`[${BF_SCOPE}]`)) {
      seedContextIfAbsent(child, context, value)
    }

    // ALSO seed relocatedDescendants (#3059): an SSR-portal-outlet target
    // is NOT a literal descendant of `currentScope` even at this, the
    // EARLIEST point any client JS runs — the adapter already placed it at
    // the shared outlet in the SSR bytes themselves, so the assumption the
    // walk above relies on ("children are still in their original SSR
    // position") is false for it from the start. Its OWN bf-s-scoped
    // descendants (e.g. a `SelectItem` authored by the same caller as
    // `SelectContent`, forwarded as `children`, and therefore ALSO
    // relocated as part of the same collected subtree) need the same seed
    // — `useContext`'s bf-h jump from one of THOSE overshoots past this
    // scope straight to whichever ancestor originally authored the JSX,
    // since `bf-h` names "who upserted me", not "my nearest reactive
    // parent" (the two differ exactly when content is forwarded through
    // more than one layer). Without this, `SelectItem`'s own `useContext`
    // call falls through to the global `contextStore` fallback — which
    // holds whichever instance provided most recently, not this one's own.
    //
    // Does NOT cover a `currentScope` instantiated once per `.map()` row
    // (#3115): `relocatedDescendants` can only find a candidate whose `bf-h`
    // names `currentScope` itself, or resolves to it through a chain — and a
    // forwarded grandchild's `bf-h` usually names the OUTERMOST authoring
    // component (here: the component that owns the `.map()`), never an
    // intermediate wrapper like `Select`, so `relocatedDescendants` yields
    // nothing at all for a looped `Select`'s own scope, seeded or not. That
    // shape still falls through to the global `contextStore` fallback,
    // tracked separately in #3115 rather than fixed here.
    for (const relocated of relocatedDescendants(currentScope)) {
      seedContextIfAbsent(relocated, context, value)
      for (const nested of relocated.querySelectorAll(`[${BF_SCOPE}]`)) {
        seedContextIfAbsent(nested, context, value)
      }
    }
  }
  contextStore.set(context.id, value)
}
