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
    // position") is false for it from the start. Covers a provider whose
    // OWN root is itself SSR-portal-relocated (e.g. a self-owner-portaled
    // component, or an explicit `<Portal>`) and that authors a
    // `Context.Provider` around content forwarded straight through it —
    // `relocatedDescendants(currentScope)` still finds a candidate whose
    // `bf-h`/`bf-po` names `currentScope` itself in that shape, unlike the
    // multi-hop-forwarding case below.
    //
    // NOT a fix for content forwarded through more than one authoring
    // layer (e.g. `Select` > `SelectContent` > `SelectItem`, all three
    // authored directly in one caller's JSX): `bf-h` on the innermost piece
    // names the OUTERMOST author, not the intermediate component that
    // actually calls `provideContext` — so `relocatedDescendants(Select's
    // own scope)` can never reach `SelectItem` there, seeded or not,
    // looped row or not (`scope.ts`'s `relocatedDescendants` doc comment
    // has the full trace). A `<Select>` rendered once per `.map()` row
    // silently failing to react to item clicks turned out NOT to be this
    // gap in practice — it was `findSsrScopeBySlotIn`'s portal fallback
    // (`slot-resolver.ts`) never discovering `SelectItem` at all, so its
    // own `init()` never ran; fixed there. As of this fix no shipped
    // `ui/components/ui/*` component exercises the shape this block below
    // is actually for (a `Context.Provider` whose own root is relocated) —
    // kept as defense for one, unverified by a regression test.
    for (const relocated of relocatedDescendants(currentScope)) {
      seedContextIfAbsent(relocated, context, value)
      for (const nested of relocated.querySelectorAll(`[${BF_SCOPE}]`)) {
        seedContextIfAbsent(nested, context, value)
      }
    }
  }
  contextStore.set(context.id, value)
}
