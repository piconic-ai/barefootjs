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

  // Process any pending child initializations for this component
  const pending = pendingChildInits.get(name)
  if (pending) {
    for (const { scope, props } of pending) {
      // Skip if already initialized as a child component.
      // When scope has no ~ prefix, it's a root component whose parent
      // marked it during hydrate — still needs child init.
      if (hydratedScopes.has(scope) && scope.getAttribute(BF_SCOPE)?.startsWith(BF_CHILD_PREFIX)) {
        continue
      }
      init(scope, props)
    }
    pendingChildInits.delete(name)
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

  // Skip if already initialized as a child component.
  // When scope has no ~ prefix, it's a root component whose parent
  // marked it during hydrate — still needs child init.
  if (hydratedScopes.has(childScope) && childScope.getAttribute(BF_SCOPE)?.startsWith(BF_CHILD_PREFIX)) {
    return
  }
  const prevScope = setCurrentScope(childScope)
  init(childScope, props)
  setCurrentScope(prevScope)
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
