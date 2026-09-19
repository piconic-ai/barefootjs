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
// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's presence guard no longer
// treats the prop as defaultless — `data-label` now renders `'none'` here
// exactly like Hono, both for a plain default and a renamed one.
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 at compile time instead of silently crashing
// Perl `strict`-mode template execution — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // A component-body const bound to an opaque call (`const label =
  // makeLabel()`) and invoked in text position lowers to a bare template
  // variable named after the const, with no diagnostic — the reference runs
  // the accessor at render time. Escape twin:
  // `opaque-local-accessor-call-client`.
  'opaque-local-accessor-call': { limitation: 'opaque-local-accessor-call' },
  // #3059: the compiler now recognizes the `ref`-callback SSR-portal
  // pattern (`ssrPortalOwnerScope`) and the Hono reference adapter
  // places the flagged element at its `<BfPortals />` outlet instead of
  // rendering it inline — this adapter has no such outlet yet (a
  // template-language-specific design the issue leaves open), so it
  // still renders the element at its ORIGINAL inline position with no
  // `bf-po`, diverging from the now-correct reference. See
  // `ref-callback-portal-content-inline-at-ssr`.
  dialog: { limitation: 'ref-callback-portal-content-inline-at-ssr' },
  'dropdown-menu': { limitation: 'ref-callback-portal-content-inline-at-ssr' },
  popover: { limitation: 'ref-callback-portal-content-inline-at-ssr' },
  portal: { limitation: 'ref-callback-portal-content-inline-at-ssr' },
  // `combobox` / `select` carry the SAME #3059 portal-position divergence
  // (their Content element is the same `ref`-callback SSR-portal pattern),
  // but the registry lists a fixture on exactly one entry and these two
  // are already claimed by `ref-effect-attr-state-ssr` (the data-placeholder
  // divergence) — cite that one instead; see
  // `ref-callback-portal-content-inline-at-ssr`'s own comment.
  combobox: { limitation: 'ref-effect-attr-state-ssr' },
  select: { limitation: 'ref-effect-attr-state-ssr' },
}
