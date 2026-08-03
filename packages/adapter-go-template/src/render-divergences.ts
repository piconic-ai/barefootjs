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

  // Onboarding TSX-fidelity fixtures (PR #2461): `expectedHtml` was
  // hand-authored to the CORRECT output while the emission bug lived in
  // the shared compiler layer — every adapter, including the Hono
  // reference, used to emit the broken form. That shared-layer defect
  // (#2460) is now FIXED (b4f5075): `expectedHtml` is generated from the
  // Hono reference like any other fixture. The remaining gap is
  // Go-specific — the Input struct field stays keyed by the local
  // binding instead of `sourceName ?? name`, so the caller-side struct
  // literal fails `go run` outright — tracked by #2525 (go-template's
  // `go run` exit-1 failure). Graduate by keying the Input struct field
  // by `sourceName ?? name` and deleting this line (and the matching
  // hono `skipJsx` entry, already gone).
  'aliased-destructured-prop':
    'aliased destructured prop `{ n: count }` loses its rename — the Input struct field is Count `json:"count"`, so the caller-side struct literal keyed by the real prop name fails `go run` outright (unknown field N, exit 1) (https://github.com/piconic-ai/barefootjs/issues/2525)',
}
