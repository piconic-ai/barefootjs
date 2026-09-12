/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Mojolicious. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2696 graduated: `todo-app` / `todo-app-ssr` seeded `todos` opaque
// because their `.map(t => ({ ...t, editing: false }))` callback body's
// object-literal SPREAD refused (`checkSupport`). Step 2 admits a spread
// at value position and the runtime evaluator's `object-literal` case
// now merges it, so the seed classifies `derived` and SSRs identically
// to Hono.
export const renderDivergences: RenderDivergences = {
  // #2943: a BODY-destructured prop default (`const { label = 'none' } =
  // props`) never reaches `ParamInfo.defaultValue` (`extractPropsFromTypeMembers`
  // is type-member info only) nor the SSR stash seed (`extractSsrDefaults`
  // skips defaults in props-object mode), so the adapter's presence guard
  // (`<% if (defined $label) { %>`) OMITS `data-label` when the caller
  // passes nothing — Hono's real destructuring default renders
  // `data-label="none"`. The parameter-destructured twin
  // (`destructured-props-live`) is correct on this adapter.
  'body-destructured-props-live':
    'body-destructured prop default omits the attribute instead of rendering the default on SSR (https://github.com/piconic-ai/barefootjs/issues/2943)',
}
