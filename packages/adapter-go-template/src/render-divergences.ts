/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Go. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 *
 * (#2630's `static-array-from-props-with-component-precomputed` divergence
 * graduated once the harness (`test-render.ts`'s
 * `buildDynamicChildLoopSeeding`, despite the name — see its doc comment)
 * learned to seed a prop-backed static child-component loop's Props slice
 * the same way it already seeded a signal-backed dynamic one: the adapter's
 * own `emission` was never the bug, only this harness's route-handler
 * stand-in was missing the prop-derived case.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'signal-object-spread-init':
    'PRE-EXISTING, unrelated to the #2696 Step 2 spread work this fixture pins: a `derived`-classified signal/memo whose value is an OBJECT literal has no live-template-expression lowering on Go — unlike the other six template-stash backends (e.g. minijinja emits `{% set merged = dict(base, done=true) %}`), Go always bakes an object-typed signal/memo field into Go SOURCE at `NewXxxProps` constructor time (`convertInitialValue`/`parsedLiteralToGo`), and that baker is STATIC-only (identifier/call/member operands defer, `parsed-literal-to-go.ts`\'s own docstring) — it cannot reference a live prop at all. Reproduced identically with the spread REMOVED (`createSignal({ id: base.id, done: true })`), confirming the gap predates and is independent of spread: the signal seeds `nil` and every field read (`.Merged.ID`/`.Merged.Done`) reads the Go zero value regardless of `initialTodos`. Not filed as a tracked `known-limitation` issue by this change — flagging here for the maintainer to triage (a genuinely new Go capability, not a #2696 regression).',
}
