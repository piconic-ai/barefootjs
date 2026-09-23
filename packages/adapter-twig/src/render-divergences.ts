/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real PHP Twig. The conformance `skipJsx` set and
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
// `templatePrimitive` (`bf.is_element`, backed by a new `is_element`
// method on the shared BarefootJS PHP runtime, also used by Blade) ahead
// of `call()`'s generic fallback. Every other bare-name call — including
// this fixture's non-`isValidElement` helper called from a ternary `test`
// — now refuses loudly with BF101 regardless of position, so this no
// longer renders divergent output; it fails to compile the same way
// `module-const-arrow-helper` / `module-function-helper-chain` already do
// — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // A component-body const bound to an opaque call (`const label =
  // makeLabel()`) and invoked in text position lowers to a bare template
  // variable named after the const, with no diagnostic — the reference runs
  // the accessor at render time. Escape twin:
  // `opaque-local-accessor-call-client`.
  'opaque-local-accessor-call': { limitation: 'opaque-local-accessor-call' },
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/twig-adapter.ts`), reusing the `register_portal_element`/
  // `portals` methods #3123 already landed on the shared `@barefootjs/php`
  // runtime (`BarefootJS.php`) for Blade.
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
  // A client component whose whole return is a child-component call: the
  // reference wraps the child's output in the parent's `<!--bf-scope:...-->`
  // comment pair (with the parent's props) so the parent hydrates; this
  // adapter renders the child's output bare. `normalizeHTML` strips scope
  // comments, so the byte comparison alone cannot see it — the explore
  // adapter axis (`comment-root-child-slot`) shows the parent's forwarded
  // handler doing nothing after hydration.
  'component-root-client-scope': { limitation: 'component-root-client-scope-comment' },
}
