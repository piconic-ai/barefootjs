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
 *
 * Empty — the file's last live entry (`aliased-destructured-prop`, #2525)
 * graduated: the Input struct field is now keyed by `sourceName ?? name`
 * (caller-facing), so the caller-side composite literal `go run`s clean.
 * Keep the file (and this header) when the set is empty — the next
 * divergence lands here, not in a re-created file.
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

  // exit 1 — generated Go does not compile (#2627):
  //   ./main.go:54:9: cannot use map[string]any{…} (value of type
  //   map[string]any) as []TagInput value in struct literal
  // The `tags` prop is a `Record<string, T>`; this adapter emits a SLICE
  // field (`[]TagInput`) for it, so the caller-side composite literal —
  // correctly a map, since the component calls `Object.entries(props.tags)`
  // — cannot be assigned. Squarely the "should eventually become a loud
  // BF101 refusal instead of broken codegen" class this file's header
  // describes.
  //
  // Pre-existing, not caused by the twin: the BASE fixture
  // (`static-array-from-props-with-component`) is BF101-refused here
  // (#2321), so Go codegen was never reached and the bad type sat behind
  // that refusal. #2626's `/* @client */` twin suppresses BF101, reaches
  // the Go backend for the first time, and exposes it.
  //
  // Consequence for the escape ledger, stated plainly: this entry makes
  // `twinWorksOnAdapter` false here, so the base fixture KEEPS its
  // `unescapable` pin on this adapter. The escape is verified on the other
  // adapters, not on go-template. Graduating #2627 deletes this entry and
  // that pin together.
  'static-array-from-props-with-component-client':
    'generated Go fails `go run` (exit 1): a Record<string, T> prop is emitted as a slice field, so the map-shaped caller literal will not assign — https://github.com/piconic-ai/barefootjs/issues/2627',
}
