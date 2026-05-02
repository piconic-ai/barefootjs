/**
 * BarefootJS - Component Registry
 *
 * Component registry for parent-child communication.
 * Each component registers its init function so parents can initialize children with props.
 */

import { BF_SCOPE, BF_CHILD_PREFIX } from '@barefootjs/shared'
import { hydratedScopes } from './hydration-state'
import { setCurrentScope } from './context'
import { createComponent } from './component'
import type { InitFn } from './types'

/**
 * Component registry for parent-child communication.
 */
const componentRegistry = new Map<string, InitFn>()

/**
 * Queue of pending child initializations waiting for components to register.
 * Key: component name, Value: array of pending init requests
 */
const pendingChildInits = new Map<string, Array<{ scope: Element; props: Record<string, unknown> }>>()

/**
 * Register a component's init function for parent initialization.
 * Also processes any pending child initializations for this component.
 *
 * @param name - Component name (e.g., 'Counter', 'AddTodoForm')
 * @param init - Init function that takes (scope, props)
 */
export function registerComponent(name: string, init: InitFn): void {
  componentRegistry.set(name, init)

  // Drain any pending child initializations queued before this component
  // registered. Re-enter through initChild so the same hydratedScopes
  // bookkeeping + currentScope wrapping applies to deferred and immediate
  // calls alike.
  const pending = pendingChildInits.get(name)
  if (pending) {
    pendingChildInits.delete(name)
    for (const { scope, props } of pending) {
      initChild(name, scope, props)
    }
  }
}

/**
 * Get a component's init function from the registry.
 * Used by createComponent() to initialize dynamically created components.
 *
 * @param name - Component name
 * @returns Init function or undefined if not registered
 */
export function getComponentInit(name: string): InitFn | undefined {
  return componentRegistry.get(name)
}

/**
 * Initialize a child component with props from parent.
 * Used by parent components to pass function props (like onAdd) to children.
 *
 * If the child component's script hasn't loaded yet (component not registered),
 * queues the initialization request. When the component registers via
 * registerComponent(), pending initializations are processed synchronously.
 *
 * @param name - Child component name
 * @param childScope - The child's scope element (found by parent)
 * @param props - Props to pass to the child (including function props)
 */
export function initChild(
  name: string,
  childScope: Element | null,
  props: Record<string, unknown> = {}
): void {
  if (!childScope) return

  const init = componentRegistry.get(name)
  if (!init) {
    // Component not registered yet - queue initialization for when it registers
    // This handles cases where parent script loads before child script
    if (!pendingChildInits.has(name)) {
      pendingChildInits.set(name, [])
    }
    pendingChildInits.get(name)!.push({ scope: childScope, props })
    return
  }

  // Child-prefixed scopes (`~Foo_xxx`) are owned by the parent's initChild
  // entirely — once we've run their init, never re-enter. Top-level scopes
  // (no `~`) reach this path through `upsertChild` during reconcile, where
  // re-invoking init is the documented way to deliver fresh closure-captured
  // callback props to the child. So only short-circuit the prefixed case.
  if (
    hydratedScopes.has(childScope) &&
    childScope.getAttribute(BF_SCOPE)?.startsWith(BF_CHILD_PREFIX)
  ) {
    return
  }

  const prevScope = setCurrentScope(childScope)
  try {
    init(childScope, props)
  } finally {
    setCurrentScope(prevScope)
  }

  // Mark the scope as hydrated AFTER init runs so the doc-order walker in
  // hydrate.ts knows to skip this element on its later pass — the parent
  // has just claimed responsibility for it. This is what lets the walker
  // get away with a single `hydratedScopes.has(el)` check instead of an
  // ancestor-name guard.
  hydratedScopes.add(childScope)
}

/**
 * Upsert a child component at a slot inside `parent`. Resolves the SSR vs
 * CSR shape at runtime in one place — so the compiler doesn't need a
 * `mode: 'csr' | 'ssr'` argument for child component emission.
 *
 *   1. SSR: a `[bf-s$="_<slotId>"]` (or `[bf-s^="<name>_"]` when slotId is
 *      null) element exists. Initialise it via initChild and return it.
 *   2. CSR: a `[data-bf-ph="<slotId|name>"]` placeholder exists. Replace it
 *      with `createComponent(name, props, key)` and return the new element.
 *   3. Neither matches (already initialised on a previous reconcile pass) —
 *      no-op, return null.
 *
 * The returned element is the live component scope element — callers can
 * use it for follow-up effects (e.g. a children-textContent createEffect).
 */
export function upsertChild(
  parent: Element,
  name: string,
  slotId: string | null,
  props: Record<string, unknown>,
  key?: string | number,
): HTMLElement | null {
  // SSR: scope element is already in the tree.
  const ssrSelector = slotId
    ? `[bf-s$="_${slotId}"]`
    : `[bf-s^="~${name}_"], [bf-s^="${name}_"]`
  const ssr = parent.querySelector(ssrSelector) as HTMLElement | null
  if (ssr) {
    initChild(name, ssr, props)
    return ssr
  }
  // CSR: replace placeholder with a freshly-created component.
  const phId = slotId ?? name
  const ph = parent.querySelector(`[data-bf-ph="${phId}"]`) as HTMLElement | null
  if (ph) {
    const comp = createComponent(name, props, key)
    ph.replaceWith(comp)
    return comp
  }
  return null
}
