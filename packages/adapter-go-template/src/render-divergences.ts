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

  // Onboarding TSX-fidelity fixtures (PR #2461): `expectedHtml` is
  // hand-authored to the CORRECT output because the emission bug lives in
  // the shared compiler layer — every adapter, including the Hono
  // reference, currently emits the broken form (verified against this
  // adapter's emitted template; see each fixture's docstring). Graduate
  // by fixing the shared emission, regenerating `expectedHtml` from the
  // fixed reference, and deleting these lines (and the matching hono
  // `skipJsx` entries).
  'aliased-destructured-prop':
    'aliased destructured prop `{ n: count }` loses its rename — the Input struct field is Count `json:"count"`, so the caller-side struct literal keyed by the real prop name fails `go run` outright (unknown field N, exit 1) (https://github.com/piconic-ai/barefootjs/issues/2460)',

  // #2482 audit follow-ups: loop-scope holes specific to this adapter's
  // four-stack scope tracking and its SSR seeding. Graduate by applying
  // the fix described in each issue and deleting the line.
  'loop-destructured-param-condition':
    'a destructured .map() param binding used as a row ternary CONDITION emits the root-scope `{{if $.Active}}` — `renderConditionExpr` omits `loopBindingStack`, unlike `identifierToGoRef` (text positions resolve the same binding correctly) (https://github.com/piconic-ai/barefootjs/issues/2486)',
  'nested-loop-tail-content':
    'outer-row content AFTER a nested inner loop renders through non-loop arms (spread lowers to the component-root `.Spread_0`) — `inLoop` is cleared, not restored, by the inner loop\'s exit; the same content BEFORE the inner loop emits correctly (https://github.com/piconic-ai/barefootjs/issues/2487)',
  'loop-param-shadows-spread-const':
    'spreading a loop row object mangles attribute names (`id` → `-i-d`, `title` → `-title`); the spread VALUE is correctly row-scoped, distinguishing this from the template-adapter const-shadow hole #2489 (https://github.com/piconic-ai/barefootjs/issues/2490)',
  'loop-param-shadows-record-template-span':
    'a dynamic-key element access on a loop row (`tone[k]`) renders empty at execute time — the emitted template contains no baked const (correct post-fix), but the row lookup resolves to nothing (https://github.com/piconic-ai/barefootjs/issues/2491)',
  'callback-param-shadows-prop':
    'JS-computed signal/memo initializers (`[…].map(…).join(…)`, memo over signal + prop) don\'t seed Go SSR — renders `[]` / empty where every other adapter renders the computed value; hydration snaps to correct (https://github.com/piconic-ai/barefootjs/issues/2492)',
}
