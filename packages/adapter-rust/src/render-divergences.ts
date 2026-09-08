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

// #2696 graduated: `todo-app` / `todo-app-ssr` seeded `todos` opaque
// because their `.map(t => ({ ...t, editing: false }))` callback body's
// object-literal SPREAD refused (`checkSupport`). Step 2 admits a spread
// at value position and the runtime evaluator's `object-literal` case
// now merges it, so the seed classifies `derived` and SSRs identically
// to Hono.
export const renderDivergences: RenderDivergences = {
  // #2886: the filter `member()` emitter has no `props.x` flattening,
  // unlike its non-filter sibling — a bare-props-form prop read DIRECTLY
  // (no destructure, `props.hiddenId`) inside a `.filter()` predicate
  // emits `props.hiddenId`, and `props` is undefined. Added for #2879's Go
  // Template adapter fix, but this fixture is a shared cross-adapter
  // conformance fixture, not Go-specific.
  'filter-predicate-props-member': 'https://github.com/piconic-ai/barefootjs/issues/2886',
}
