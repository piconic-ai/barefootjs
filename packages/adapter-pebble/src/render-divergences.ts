/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Java/Pebble. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // #2994: a module-scope helper (arrow-valued const OR `function`
  // declaration) that's safe to reference by bare name from the CSR
  // template lambda is ALSO treated safe by the same
  // `compute-inlinability.ts` verdict feeding the static `.peb` Marked
  // Template this adapter renders from — but there is no `fmt` binding in
  // Pebble's template scope (`bf`, props, and locals only). The
  // `fmt(label)` slot renders silently empty instead of computing the real
  // value or refusing to compile, matching every sibling DSL/template-string
  // adapter's own documented divergence for this same fixture.
  'module-const-arrow-helper':
    'a module-scope helper call in a template position renders empty instead of the real value, with no compile diagnostic (https://github.com/piconic-ai/barefootjs/issues/2994)',
}
