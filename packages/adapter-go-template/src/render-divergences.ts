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
  'jsx-element-prop-fragment-conditional':
    'Go-specific half of the fragment-wrapped-conditional prop shape, tracked as https://github.com/piconic-ai/barefootjs/issues/2703 (distinct from #2702, the cross-adapter hydrate-time bug). #2702 is a hydrate-time-only bug (SSR is correct on every adapter, confirmed for Go by direct `adapter.generate()` inspection of the raw template TEXT, which does contain `{{if .Cond}}<a bf-c="^s0">x</a>{{else}}...{{end}}`-shaped markup). But the REAL Go render of this exact fixture (`go-template-adapter.test.ts`, real `go run`) produces an EMPTY `<header>` — `<header bf="s1"><!--bf:s0--><!--/--></header>` instead of the reference `<a>x</a>` — i.e. the `header` prop\'s jsx-children payload never reaches the child (`Card`) component\'s slot construction (`.CardSlot1`) at all for this NAMED-prop shape, even though the same conditional-in-fragment payload renders correctly when passed via `children` instead (`jsx-element-prop-children-escape`). Root cause not yet isolated to a specific emitter function — only the reproducible symptom is pinned here. Every other adapter (Hono, ERB, Jinja, Mojolicious, MiniJinja, Twig, Xslate, Blade) renders this fixture correctly; verified by running each adapter\'s own JSX Conformance Tests for this fixture id.',
  'children-passthrough-renamed':
    'A `children` prop destructured under a different name (`const { children: kids } = props`) does not reach the SSR template on Go, tracked as https://github.com/piconic-ai/barefootjs/issues/2788. The same fixture also fails on Mojolicious, where the mechanism IS isolated: the `.html.ep` interpolates the LOCAL alias (`$kids`) while the stash defines only the caller-facing `children`, so the Perl render dies inside `Mojo::Template::process`. Go\'s own failure mode has NOT been read — `go` is not reachable from the local test process (the conformance case prints "go command not found" and skips), so this entry is declared from the CI failure on #2787 alone, not from a local reproduction. Whoever graduates this should read Go\'s actual output first rather than assume it shares Mojo\'s mechanism. Same alias family as `aliased-destructured-prop` (`{ n: count }`), whose Go half graduated in #2525 — worth checking whether the reserved `children` slot bypasses that fix or never had it. `children-passthrough-renamed` asserts the CORRECT (Hono-generated) output, so deleting this entry is the graduation.',
  'signal-object-spread-init':
    'PRE-EXISTING, unrelated to the #2696 Step 2 spread work this fixture pins: a `derived`-classified signal/memo whose value is an OBJECT literal has no live-template-expression lowering on Go — unlike the other six template-stash backends (e.g. minijinja emits `{% set merged = dict(base, done=true) %}`), Go always bakes an object-typed signal/memo field into Go SOURCE at `NewXxxProps` constructor time (`convertInitialValue`/`parsedLiteralToGo`), and that baker is STATIC-only (identifier/call/member operands defer, `parsed-literal-to-go.ts`\'s own docstring) — it cannot reference a live prop at all. Reproduced identically with the spread REMOVED (`createSignal({ id: base.id, done: true })`), confirming the gap predates and is independent of spread: the signal seeds `nil` and every field read (`.Merged.ID`/`.Merged.Done`) reads the Go zero value regardless of `initialTodos`. Graduate by teaching the baker to emit prop-referencing Go expressions (https://github.com/piconic-ai/barefootjs/issues/2700).',
}
