/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Java/Pebble. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2994/#3000/#3012 fixed the silent-render divergence on all 8 sibling
// non-JS adapters by teaching their `call()` fallback to refuse the shape
// loudly with BF101 (#3011, #3014+). Pebble was developed on a separate
// stacked branch and didn't exist on `main` when those PRs landed, so it
// never received the port and is still on the old silent-divergence
// behavior for all three fixtures below — tracked by #3022 (Pebble's own
// graduation to BF101 parity with its siblings).
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
  // #3000: the function-declaration analog (a module-scope function calling
  // another module-scope function) — same root cause, same empty-slot
  // divergence.
  'module-function-helper-chain':
    'a module-scope helper call in a template position renders empty instead of the real value, with no compile diagnostic (https://github.com/piconic-ai/barefootjs/issues/3000)',
  // #3012: a module-scope helper called from a boolean-test position (a
  // ternary's `test`) resolves to Pebble's undefined-variable/falsy
  // semantics instead of the real value, silently picking the wrong
  // ternary branch instead of refusing to compile.
  'module-helper-boolcontext-call':
    'a module-scope helper called from a boolean-test position resolves falsy instead of the real value, silently picking the wrong branch with no compile diagnostic (https://github.com/piconic-ai/barefootjs/issues/3012)',
}
