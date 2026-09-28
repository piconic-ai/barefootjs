/**
 * BarefootJS - Template Registry
 *
 * Stores template functions for client-side component creation.
 * Templates generate HTML strings from props, used by createComponent().
 */

import { createRoot } from '@barefootjs/client/reactive'

/**
 * Template function type - generates HTML string from props
 */
export type TemplateFn = (props: Record<string, unknown>) => string

/**
 * Run a compiler-emitted `template()` call inside a throwaway reactive root
 * that is disposed immediately after it returns (#3235).
 *
 * A CSR `template()` renders markup from state *at call time* — by contract
 * (see `BranchConfig.template`'s docstring, `insert.ts`) it owns no
 * persistent reactive state; the real, retained setup happens in `init()`,
 * which runs separately afterwards and is given its own long-lived root
 * (`hydrate.ts`'s `runInit`, `map-array.ts`'s per-item `createRoot`). But a
 * `template()` call runs arbitrary compiler-emitted JS, including a local's
 * initializer the compiler inlined verbatim when the JSX reads it
 * (`csr-substitute.ts`) — e.g. `const value = watch(props.source)`, a call
 * into another module the compiler cannot prove pure. When that call
 * creates a signal or registers `onMount`/`onCleanup`, and `template()` runs
 * with no owner yet — the top-level `render()` entry point, before `init`
 * has created one — the registration has nothing to release it: `onMount`
 * runs synchronously and `onCleanup` is a permanent no-op, so whatever it
 * subscribed to leaks for the lifetime of the page.
 *
 * Wrapping every `template()` invocation in a throwaway root that disposes
 * right after gives that call a real owner regardless of ambient context, so
 * anything it creates is torn down before this function returns. The
 * genuinely-retained instance's own `init()` call (which runs moments later,
 * under its own longer-lived root) creates the real signal again — this is
 * exactly the duplicate-execution the compiler already produces for any
 * opaque template-inlined call (matching Hono SSR's contract, see
 * `packages/adapter-tests/src/csr-skip-set.ts`'s `opaque-local-accessor-call`
 * note); this only makes sure the throwaway run's side effects don't
 * outlive it. `createRoot` also isolates signal reads from tracking
 * (`Listener = null`), so this subsumes an explicit `untrack()` wrapper
 * around the same call.
 *
 * `dispose()` runs in a `finally` so a `template()` call that throws (a
 * documented, expected shape at some call sites — e.g. `insert.ts`'s
 * `evalBranchTemplate()` callers catch a nullable-access `TypeError` from
 * the compiled template) still tears down whatever it registered before
 * throwing. Disposing only after a normal return would reproduce the exact
 * owner-less leak this function exists to close, just on the exception
 * path, and would leave the abandoned root referenced forever in its
 * ambient owner's `children` set.
 */
export function evalTemplateFn<T>(fn: () => T): T {
  return createRoot((dispose) => {
    try {
      return fn()
    } finally {
      dispose()
    }
  })
}

/**
 * Registry storing template functions by component name
 */
const templateRegistry = new Map<string, TemplateFn>()

/**
 * Register a template function for a component.
 *
 * @param name - Component name (e.g., 'TodoItem')
 * @param templateFn - Function that generates HTML from props
 *
 * @example
 * registerTemplate('TodoItem', (props) => `
 *   <li class="${props.done ? 'done' : ''}">
 *     <span>${props.text}</span>
 *   </li>
 * `)
 */
export function registerTemplate(name: string, templateFn: TemplateFn): void {
  templateRegistry.set(name, templateFn)
}

/**
 * Get a registered template function by component name.
 *
 * @param name - Component name
 * @returns Template function or undefined if not registered
 */
export function getTemplate(name: string): TemplateFn | undefined {
  return templateRegistry.get(name)
}

/**
 * Check if a template is registered for a component.
 *
 * @param name - Component name
 * @returns true if template is registered
 */
export function hasTemplate(name: string): boolean {
  return templateRegistry.has(name)
}
