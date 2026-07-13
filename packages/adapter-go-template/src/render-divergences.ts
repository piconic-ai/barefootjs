/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference on real Go — or whose generated Go fails `go run` outright
 * (marked "exit 1" below; those should eventually become loud BF101
 * refusals instead of broken codegen).
 *
 * Consumed by this package's conformance test (its `skipJsx` set is
 * derived from these keys, so the skip list and this declaration can't
 * drift) and by `packages/compat`, which publishes the entries in the
 * fixture-divergences section of `ui/compat.lock.json` — surfaced on
 * the docs compatibility-matrix page. Graduating an entry means fixing
 * the adapter (or the shared compiler layer) and deleting the line.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // `loop-param-shadows-outer-name` (#2212/#2221/#2222 cross-adapter
  // fixture): `convertExpressionToGo` picks the `+` operator's Go helper
  // (`bf_add` numeric vs `bf_concat_str` string) by looking up the
  // identifier's declared TYPE — and for `1 + label` inside
  // `.map((label) => ...)`, it resolves `label`'s type against the OUTER
  // `label: string` prop the loop param shadows, instead of the loop's
  // actual element type (`number`, from `values: number[]`). Emits
  // `bf_concat_str` (`"1" + "1"` → `"11"`) instead of `bf_add`
  // (`1 + 1` → `2`). Same bare-identifier/shadowing bug class as
  // #2221/#2222, but in Go's SSR type-inference-for-operator-selection
  // path (`convertExpressionToGo`), which those shared-compiler fixes
  // don't touch. Tracked as its own known limitation — see
  // https://github.com/piconic-ai/barefootjs/issues/2236.
  'loop-param-shadows-outer-name':
    'BF-2236: convertExpressionToGo resolves a loop-param-shadowed identifier\'s type against the shadowed OUTER binding when choosing the `+` operator helper, emitting bf_concat_str (string concat) instead of bf_add (numeric addition)',
  // `todo-app-ssr` no longer diverges (#2209). Two parts: (1) `.Todos`
  // (the loop's DATUM slice) is already seeded straight from the caller's
  // Input — the constructor derives it from `initialTodos`, and `[]Todo`
  // zero-fills `Editing: false`, so the `.map(t => ({ ...t, editing:
  // false }))` transform in the signal initializer was never actually the
  // gap on Go, unlike the 7 template-string adapters. (2) The real gap was
  // `.TodoItems []TodoItemProps` — the loop-body CHILD COMPONENT slice the
  // template actually ranges over — which has no server-side population
  // path in this harness (documented as route-handler-populated in
  // production). `buildDynamicChildLoopSeeding` (this package's
  // `test-render.ts`) now replicates that documented contract for a
  // signal-backed dynamic child-component loop.
}
