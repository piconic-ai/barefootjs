/**
 * BarefootJS - Template Registry
 *
 * Stores template functions for client-side component creation.
 * Templates generate HTML strings from props, used by createComponent().
 */

import { createRoot, hasOwner, untrack } from '@barefootjs/client/reactive'

/**
 * Template function type - generates HTML string from props
 */
export type TemplateFn = (props: Record<string, unknown>) => string

/**
 * Run a compiler-emitted `template()` call with reactivity isolated from the
 * caller, giving it a throwaway reactive root ONLY when no owner is already
 * active (#3235, tightened by #3254 review).
 *
 * A CSR `template()` renders markup from state *at call time* — by contract
 * (see `BranchConfig.template`'s docstring, `insert.ts`) it owns no
 * persistent reactive state of its own; the real, retained setup happens in
 * `init()`. Most of the time `init()` runs separately afterwards, under its
 * own long-lived root (`hydrate.ts`'s `runInit`, `map-array.ts`'s per-item
 * `createRoot`). But a `template()` call runs arbitrary compiler-emitted JS,
 * including a local's initializer the compiler inlined verbatim when the
 * JSX reads it (`csr-substitute.ts`) — e.g. `const value = watch(props.source)`,
 * a call into another module the compiler cannot prove pure. When that call
 * creates a signal or registers `onMount`/`onCleanup`, and `template()` runs
 * with no owner yet — the top-level `render()` entry point, before `init`
 * has created one — the registration has nothing to release it: `onMount`
 * runs synchronously and `onCleanup` is a permanent no-op, so whatever it
 * subscribed to leaks for the lifetime of the page. Giving that specific
 * call a throwaway root that disposes right after closes the leak; the
 * genuinely-retained instance's own `init()` call (which runs moments later)
 * creates the real signal again — this is exactly the duplicate-execution
 * the compiler already produces for any opaque template-inlined call
 * (matching Hono SSR's contract, see `packages/adapter-tests/src/csr-skip-set.ts`'s
 * `opaque-local-accessor-call` note).
 *
 * When an owner IS already active, this call must NOT get a separate
 * throwaway root: `template()` for a branch/callback that embeds a live
 * child (`renderNode`-style JSX, `__bfSlot`-spliced Nodes) synchronously
 * runs that child's own `materializeComponent`/`initFn` as part of producing
 * its result — there is no separate later "real run" to hand off to, this
 * IS the one and only mount. Wrapping it in a root that gets disposed the
 * instant `template()` returns would tear down that child's freshly-created
 * effects immediately (found via `site/ui`'s xyflow Highlight-Depth demo:
 * the per-node `--node-glow` style effect, created by the `renderNode`
 * callback's `initFn` while still inside `insert.ts`'s `evalBranchTemplate`,
 * got disposed before the first signal update could ever reach it). With a
 * real owner already active, whatever the call creates is naturally owned
 * by it and released on the SAME schedule as everything else that owner
 * governs — exactly the outcome `init()`-after-`template()` would have
 * produced. `untrack()` alone still isolates signal reads from the ambient
 * Listener (the same isolation `createRoot` provides), so a duplicate-count
 * concern for an opaque template-inlined call doesn't change: it behaves the
 * same as any other nested `template()` call already did before #3235
 * (`map-array.ts`'s per-item root, still relied on unchanged).
 *
 * `dispose()` runs in a `finally` (throwaway-root branch only) so a
 * `template()` call that throws (a documented, expected shape at some call
 * sites — e.g. `insert.ts`'s `evalBranchTemplate()` callers catch a
 * nullable-access `TypeError` from the compiled template) still tears down
 * whatever it registered before throwing, rather than reproducing the exact
 * owner-less leak this function exists to close on the exception path.
 */
export function evalTemplateFn<T>(fn: () => T): T {
  if (hasOwner()) {
    return untrack(fn)
  }
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
