/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference through the real `bf-render` minijinja binary. The
 * conformance `skipJsx` set and `packages/compat`'s published
 * fixture-divergences both derive from this one object, so the skip list
 * and the declaration can't drift. Keep the file even when the set is
 * empty — the next divergence lands here, not in a re-created file.
 * (`string-concat-plus` is NOT here — minijinja's `+` concatenates
 * strings, unlike Perl/PHP/Twig.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  'todo-app':
    'the `todos` signal seeds from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))` — a different-prop-derived `.map()` chain `extractSsrDefaults` cannot statically resolve, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute), so it seeds `null`; the non-`/* @client */`-marked `{todos().length > 0 && ...}` toggle-all block SSRs as if there are zero todos regardless of `initialTodos` (https://github.com/piconic-ai/barefootjs/issues/2696)',
  'todo-app-ssr':
    "same root cause as `todo-app` (https://github.com/piconic-ai/barefootjs/issues/2696); this fixture's todo-list loop carries no `/* @client */` marker and minijinja's `{% for %}` over a null value renders zero rows rather than throwing, so it SSRs an empty `<ul class=\"todo-list\">` with the toggle-all controls also absent, regardless of `initialTodos`",
}
