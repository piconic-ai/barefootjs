/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Ruby erb. The conformance `skipJsx` set and
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
  // #2922: the static-nested-loop bake reuses the SAME Ruby local variable
  // name (`item`, the JS source's own param name) for both the outer and
  // inner loop via plain assignment rather than a block parameter — Ruby
  // assignment to a name already visible in an enclosing scope mutates
  // that shared variable instead of shadowing it. On the inner loop's
  // second-plus iteration, `item = item[:children][_i]` reads `item` as
  // whatever the PREVIOUS inner iteration left it (a leaf child, no
  // `:children` key), not the stable outer item — `nil[_i]` raises
  // `NoMethodError`. Compiles clean (no diagnostic); crashes on render.
  'static-nested-loop-shadowed-param':
    'https://github.com/piconic-ai/barefootjs/issues/2922',
}
