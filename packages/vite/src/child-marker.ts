/**
 * `@bf-child:<Name>` marker resolution.
 *
 * The compiler emits `import '/* @bf-child:ChildName *\/'` inside a
 * component's client JS for every OTHER component it references (loop-body
 * children, `initChild`-driven nested components, etc.) — see
 * `packages/jsx/src/ir-to-client-js/child-components.ts`. That specifier
 * is not a real module: it's a marker the LEGACY CLI pipeline
 * post-processes (`packages/jsx/src/combine-client-js.ts`'s
 * `combineParentChildClientJs`) by inlining the named child's compiled JS
 * directly into the parent's file, so the browser needs only one request
 * and the child's `hydrate()`/`registerComponent()` call runs as part of
 * loading the SAME script as the parent.
 *
 * Under Rollup, that inlining step is unnecessary — but simply DROPPING
 * the marker (resolving it to an empty no-op module) is not a safe
 * replacement for every child reference the marker stands for, only for
 * SOME of them. The distinction (found empirically against gin's real
 * TodoApp/TodoItem — no PR01-03 fixture exercised this shape):
 *
 * - A child rendered via `initChild()` (an SSR-hydrated child, or one
 *   whose scope a cross-template Go/ERB/… render already put on the
 *   page) is genuinely safe to drop: `@barefootjs/client`'s registry
 *   (`packages/client/src/runtime/registry.ts`) queues an `initChild`
 *   call for a not-yet-registered name (`pendingChildInits`) and drains
 *   it the moment the child's OWN script loads and calls
 *   `registerComponent` — however that script physically reached the
 *   page. As long as the child's own template renders somewhere (which
 *   is what registers its script — see `plugin.ts`'s docstring), this
 *   is load-order-tolerant by design.
 * - A child created via `createComponent(name, …)` for a PURELY
 *   client-rendered loop (no server-side row template at all — e.g.
 *   TodoApp's `.map()` over `initialTodos`, as opposed to TodoAppSSR's
 *   server-rendered rows) is NOT tolerant: `materializeComponent`
 *   (`packages/client/src/runtime/component.ts`) does one synchronous
 *   `getTemplate(name)` registry lookup with NO queueing — if the
 *   child's script hasn't run yet, it silently renders a placeholder
 *   and NEVER retries. Under the legacy inlined-JS pipeline this could
 *   never happen (the child's `registerComponent` call was physically
 *   inside the parent's own script). Under Rollup, if nothing else on
 *   the page happens to reference the child, ITS SCRIPT NEVER LOADS AT
 *   ALL, and the row permanently fails to render.
 *
 * Resolving every marker to a REAL import of the named child's `.tsx`
 * source (when discovered) closes this gap the same way Rollup already
 * handles every other cross-module reference in this design: the
 * bare `import '/* @bf-child:ChildName *\/'` statement's TEXT doesn't
 * need to change, only what it resolves to. Once it resolves to
 * `ChildName.tsx`, Rollup's OWN module graph puts an entry-to-entry
 * static import in the output (the child is ALSO independently an entry
 * point — every discovered `'use client'` file is), which is exactly
 * what makes the browser fetch and execute the child's script as a side
 * effect of loading the parent's — no registry timing dependent on
 * anything server-side at all. A name that can't be resolved (unknown,
 * or a multi-component-per-file export the simple name→file map below
 * doesn't cover) falls back to the empty no-op module rather than
 * failing the build outright — the SAME degraded-but-shippable behavior
 * as before this fix for whatever slice of cases it doesn't cover,
 * rather than a regression for OTHER apps that build cleanly today.
 */

const BF_CHILD_MARKER_RE = /^\/\* @bf-child:(\w+) \*\/$/

/** The single virtual module id an UNRESOLVED `@bf-child:` marker falls
 * back to — one shared id (not one per child name) because the module's
 * content is always the same (empty) and Rollup dedupes same-id imports
 * for free. */
export const BF_CHILD_NOOP_ID = '\0barefoot-bf-child-noop'

/** The child component name embedded in a `@bf-child:` marker, or `null`
 * if `source` doesn't look like a compiler-emitted one. */
export function bfChildMarkerName(source: string): string | null {
  return source.match(BF_CHILD_MARKER_RE)?.[1] ?? null
}
