/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Python jinja2. The conformance `skipJsx` set and
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
// seeds the evaluated default and `collectNullableOptionalProps` no longer
// treats the prop as defaultless — `data-label` now renders `'none'` here
// exactly like Hono, both for a plain default and a renamed one.
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 instead of silently rendering empty — see
// `conformance-pins.ts`.
// #3012 graduated `module-helper-boolcontext-call`: the `_boolContext`
// structural exemption (scoped by STRUCTURAL POSITION — any call inside a
// condition/ternary-test/unary-`!` operand — not by CALLEE IDENTITY) is
// removed entirely now that `isValidElement` (the one caller that
// legitimately needed it) is resolved as an identity-scoped
// `templatePrimitive` (`bf.is_element`, backed by a new Python port of the
// shared BarefootJS runtime's shape-check method) ahead of `call()`'s
// generic fallback. Every other bare-name call — including this fixture's
// non-`isValidElement` helper called from a ternary `test` — now refuses
// loudly with BF101 regardless of position, so this no longer renders
// divergent output; it fails to compile the same way
// `module-const-arrow-helper` / `module-function-helper-chain` already do
// — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/jinja-adapter.ts`) and `register_portal_element`/`portals`
  // (`python/barefootjs/runtime.py`).
  // `combobox` / `select` carry the SAME #3059 portal-position divergence
  // (their Content element is the same `ref`-callback SSR-portal pattern),
  // but the registry lists a fixture on exactly one entry and these two
  // are already claimed by `ref-effect-attr-state-ssr` (the data-placeholder
  // divergence) — cite that one instead; see
  // `ref-callback-portal-content-inline-at-ssr`'s own comment.
  combobox: { limitation: 'ref-effect-attr-state-ssr' },
  select: { limitation: 'ref-effect-attr-state-ssr' },
}
