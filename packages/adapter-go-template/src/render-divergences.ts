/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Go. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // #2630: the exact shape BF101's pass-as-prop suggestion (#2321) steers
  // go-template users into — compiles clean, runs clean, silently renders the
  // loop host empty. Full analysis in the issue.
  'static-array-from-props-with-component-precomputed':
    'prop-backed child-component loop renders the loop host empty at SSR (https://github.com/piconic-ai/barefootjs/issues/2630)',
}
