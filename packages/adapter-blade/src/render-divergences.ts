/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real PHP Blade. The conformance `skipJsx` set and
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
// #3012 graduated `module-helper-boolcontext-call`: the `_boolContext`
// structural exemption (scoped by STRUCTURAL POSITION — any call inside a
// condition/ternary-test/unary-`!` operand — not by CALLEE IDENTITY) is
// removed entirely now that `isValidElement` (the one caller that
// legitimately needed it) is resolved as an identity-scoped
// `templatePrimitive` (`$bf->is_element`, backed by the `is_element`
// method the Twig adapter's #3012 PR added to the shared BarefootJS PHP
// runtime this adapter also backs onto — zero new runtime code needed
// here) ahead of `call()`'s generic fallback. Every other bare-name call
// — including this fixture's non-`isValidElement` helper called from a
// ternary `test` — now refuses loudly with BF101 regardless of position,
// so this no longer renders divergent output; it fails to compile the
// same way `module-const-arrow-helper` / `module-function-helper-chain`
// already do — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // #3119 (graduated): the `ref`-callback SSR-portal pattern
  // (`ssrPortalOwnerScope`) now renders through
  // `BarefootJS::register_portal_element` / `bf.portals()` (an
  // `ob_start()`/`ob_get_clean()`-captured outlet, mirroring the Hono
  // reference's `<BfPortals />` and the Go adapter's
  // `{{.Portals.Render}}`), so `dialog`/`dropdown-menu`/`popover`/`portal`
  // no longer diverge here.
  // `combobox` / `select` were re-pinned here on the SAME assumption
  // (their `Content` element uses the identical `ref`-callback
  // SSR-portal pattern), but never re-verified against a real render.
  // They in fact ALREADY render the portal correctly and match Hono
  // byte-for-byte — `isSsrPortalRefCallback` (`jsx-to-ir.ts`) already
  // covers `SelectContent`'s `queueMicrotask(() => createPortal(...))`
  // deferral (see that function's own docstring), and this adapter
  // renders `ssrPortalOwnerScope` through the same shared,
  // component-agnostic path #3119 built for the other four. The portal
  // divergence never applied here; the two stayed skipped only because
  // the compiled fixture failed elsewhere the whole time (first the
  // graduated `nested-child-static-prop-text-slot-elided` marker bug),
  // so nobody re-ran them to notice. No divergence remains on this
  // adapter (verified against a real render of both fixtures).

  // Static text directly adjacent to a conditional renders with a space
  // between the text and the chosen branch (`x: off` for Hono's `x:off`).
  'text-then-conditional': { limitation: 'text-adjacent-conditional-whitespace' },
  'text-then-conditional-static': { limitation: 'text-adjacent-conditional-whitespace' },
  'conditional-then-text': { limitation: 'text-adjacent-conditional-whitespace' },

  // A boolean-literal `const` (module or function scope) read as a ternary
  // test never reaches the template: it is read as an unset variable, so
  // the falsy branch renders (`data-x="b"` for Hono's `data-x="a"`).
  'const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
  'module-const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
}
