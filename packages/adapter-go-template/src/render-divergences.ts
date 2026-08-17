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
 * Keep the file (and this header) even when the set is empty — the next
 * divergence lands here, not in a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // #2630: a prop-backed loop whose BODY is a child component renders the
  // loop host empty — compiles clean, `go run`s clean, emits no children.
  // Its sibling `static-array-from-props-precomputed` (same fixture,
  // inline element body instead of a `<Tag>` child) renders correctly on
  // every adapter, so this is specific to child-component bodies over a
  // prop-backed array — plausibly the same missing server-side population
  // path the `todo-app-ssr` note below describes, where
  // `buildDynamicChildLoopSeeding` covers only the SIGNAL-backed dynamic
  // case and a prop-backed static child loop has no analogue.
  //
  // This one costs a user something concrete: the BF101 diagnostic for
  // #2321 lists pass-as-prop FIRST because it is the escape that keeps
  // full server output, so a go-template user following that advice for a
  // child-component loop gets an empty container at SSR with nothing
  // reporting it. The fixture asserts the CORRECT (reference) output, so
  // deleting this entry once the gap is fixed turns it into the
  // regression test.
  'static-array-from-props-with-component-precomputed':
    'prop-backed child-component loop renders the loop host empty at SSR (https://github.com/piconic-ai/barefootjs/issues/2630)',

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
