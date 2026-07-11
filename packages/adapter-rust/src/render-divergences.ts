/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference through the real `bf-render` minijinja binary.
 * (`string-concat-plus` is NOT here — minijinja's `+` concatenates
 * strings, unlike Perl/PHP/Twig.)
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
  // TodoApp seeds its `todos` signal from `(props.initialTodos ??
  // []).map(t => ({ ...t, editing: false }))` — a compound expression this
  // harness's `evaluateSignalInit` can't parse, so `todos` seeds as
  // unset and minijinja's tolerant-Undefined handling silently iterates
  // zero times (`<ul class="todo-list">` renders empty). Orthogonal to
  // #2205 (sibling template registration, which these fixtures now pass
  // cleanly): a test-harness signal-seeding gap.
  'todo-app': 'https://github.com/piconic-ai/barefootjs/issues/2209',
  'todo-app-ssr': 'https://github.com/piconic-ai/barefootjs/issues/2209',
}
