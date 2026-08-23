/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Ruby erb. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'todo-app':
    'the `todos` signal seeds from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))` — a different-prop-derived `.map()` chain `extractSsrDefaults` cannot statically resolve, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute), so it seeds `nil`; the non-`/* @client */`-marked `{todos().length > 0 && ...}` toggle-all block SSRs as if there are zero todos regardless of `initialTodos` (https://github.com/piconic-ai/barefootjs/issues/2696)',
  'todo-app-ssr':
    'same root cause as `todo-app` (https://github.com/piconic-ai/barefootjs/issues/2696), but this fixture\'s todo-list loop carries no `/* @client */` marker — the compiled ERB loop iterates the nil-seeded `todos` directly and raises `NoMethodError: undefined method \'length\' for nil` instead of rendering',
}
