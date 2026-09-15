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
// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's presence guard no longer
// treats the prop as defaultless — `data-label` now renders `'none'` here
// exactly like Hono, both for a plain default and a renamed one.
export const renderDivergences: RenderDivergences = {
  // #2994: a module-scope helper (arrow-valued const OR `function`
  // declaration) that's safe to reference by bare name from the CSR
  // template lambda is ALSO treated safe by the same
  // `compute-inlinability.ts` verdict feeding the static "Marked
  // Template" this adapter renders from — but there is no `fmt` binding
  // in Ruby template scope. The `fmt(label)` slot renders silently
  // empty instead of computing the real value or refusing to compile.
  // Verified directly against real Ruby `erb` in the #2994 investigation.
  'module-const-arrow-helper':
    'a module-scope helper call in a template position renders empty instead of the real value, with no compile diagnostic (https://github.com/piconic-ai/barefootjs/issues/2994)',
  // #3000: the `function`-declaration analog of `module-const-arrow-helper`
  // above — same #2994 root cause (no `fmt` binding in Ruby template
  // scope), same silently-empty render. The doc comment above already
  // anticipated this shape ("arrow-valued const OR `function`
  // declaration"); this entry is that other shape's fixture.
  'module-function-helper-chain':
    'a module-scope helper call in a template position renders empty instead of the real value, with no compile diagnostic (https://github.com/piconic-ai/barefootjs/issues/2994)',
}
