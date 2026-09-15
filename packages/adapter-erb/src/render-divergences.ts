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
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 instead of silently rendering empty — see
// `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // #3012: #3011's BF101 refusal (#2994) is exempted for a call whose
  // return value is only ever consumed for truthiness (`_boolContext`,
  // carved out so `ui/components/ui/slot`'s `isValidElement(children)`
  // guard keeps compiling — this adapter has no dedicated shape-check
  // primitive for it). That exemption is scoped by STRUCTURAL POSITION
  // (any call inside a condition/ternary-test/unary-`!` operand), not by
  // CALLEE IDENTITY, so a call to any OTHER module-scope helper from a
  // boolean-test position still falls through to the pre-#2994 fallback
  // (an unrecognised name resolves against the vars-Hash to `nil`, and
  // `bf.truthy?(nil)` is falsy) instead of refusing loudly — a silent
  // divergence from Hono whenever the real result is truthy. Narrowing
  // the exemption to `isValidElement` by identity (mirroring the Go /
  // Mojolicious adapters' dedicated primitive, and what #3012 did for
  // Text::Xslate — it already `use`s a runtime with the same shape-check
  // method) needs net-new ERB runtime helper code, tracked at
  // https://github.com/piconic-ai/barefootjs/issues/3012.
  'module-helper-boolcontext-call':
    'A non-`isValidElement` module-scope helper called from a boolean-test position (ternary `test`) falls through the `_boolContext` exemption meant only for `isValidElement`, silently resolving to a falsy vars-Hash lookup instead of refusing with BF101 — https://github.com/piconic-ai/barefootjs/issues/3012',
}
