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

  // #2445: a child component nested inside a dynamic loop row whose root
  // is a plain element gets ONE hoisted `BadgeSlot0 BadgeProps` field on
  // the parent, built outside the loop with no per-row data, and the
  // template passes `$.BadgeSlot0` for every row — so every row renders
  // the child with zero-value props. The sibling shape (row root IS the
  // child component) already emits a per-row slice; see the `todo-app-ssr`
  // note above on `.TodoItems []TodoItemProps`.
  'composite-row-child-component':
    'a child component nested inside a dynamic loop row receives one hoisted props value built outside `{{range}}`, so every row renders the child with zero-value props (https://github.com/piconic-ai/barefootjs/issues/2445)',

  // #2447: same missing preamble lowering as the DSL adapters, with Go's
  // usual twist (cf. #2445): the value is emitted as `{{$.Cls}}` — a
  // PARENT-scope struct field, not a per-row one — and nothing populates it,
  // so every row's attribute renders empty.
  'loop-preamble-attr-value':
    "a `.map()` callback preamble's value declaration is hoisted to a parent-scope field instead of being built per row, so the attribute renders empty (https://github.com/piconic-ai/barefootjs/issues/2447)",
}
