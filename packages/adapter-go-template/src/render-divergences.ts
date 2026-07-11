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
  // TodoAppSSR (no `/* @client */` markers — the loop must render server-
  // side) seeds its `todos` signal from `(props.initialTodos ??
  // []).map(t => ({ ...t, editing: false }))`. This harness's signal-init
  // seeding can't evaluate that compound expression, so `todos` seeds
  // empty and `<ul class="todo-list">` renders with no `<li>`s. Orthogonal
  // to #2205 (sibling template registration, which this fixture now
  // compiles cleanly under): a test-harness signal-seeding gap. `todo-app`
  // (client-hydrated variant) is unaffected — its initial empty SSR list
  // is the correct pre-hydration render.
  'todo-app-ssr': 'https://github.com/piconic-ai/barefootjs/issues/2209',
}
