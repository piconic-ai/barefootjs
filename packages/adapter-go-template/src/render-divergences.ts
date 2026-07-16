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
  // `object-catalogued` (#2277): an inline object-typed prop (`cfg: { id:
  // number; label?: string }`) doesn't synthesize a named Go struct, so the
  // `Cfg` field is untyped and `.Cfg.Id` / `.Cfg.Label` render empty. The
  // object-synthesis data points still run the oracle on the dynamic
  // backends + Hono; graduating means giving an inline object prop a real
  // struct so nested member access resolves.
  // https://github.com/piconic-ai/barefootjs/issues/2299
  'object-catalogued': 'inline object-prop member access renders empty (untyped Cfg field) — #2299',
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
