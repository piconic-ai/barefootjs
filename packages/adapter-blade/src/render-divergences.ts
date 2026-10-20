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
  // A const alias chain (`const a = children; const b = a`) read in a loop
  // row that binds a name the chain passes through (`rows.map(a => …{b}…)`):
  // the template cannot inline the const through the shadowed name, and the
  // const itself is never set, so the read renders nothing.
  'children-alias-hop-shadowed-intermediate': { limitation: 'loop-shadowed-const-alias-hop' },
  // `omitted-optional-number-arithmetic` used to sit here: an omitted
  // optional number prop read as `0` in arithmetic. A prop that can only be
  // absent now reads its nil as `undefined`, giving `NaN` (#3533).
  // Arithmetic over an omitted `n?: number | null` prop: the engine holds an
  // omitted prop and a `null` one as the same nil, and the type admits both,
  // so the nil reads as `null` (`0`) where JS reads `undefined` (`NaN`).
  'omitted-optional-nullable-number-arithmetic': { limitation: 'omitted-optional-nullable-number-arithmetic' },
  // An explicit `null` carried by a `{...props}` spread onto a child: the
  // engine holds it and an omitted prop as the same nil, so the spread
  // carries the key only when it is not nil and an earlier explicit prop
  // keeps its value where JS overrides it with `null`.
  'component-spread-explicit-null': { limitation: 'props-spread-explicit-null-override' },
  // `/` over a zero divisor: PHP's `/` throws `DivisionByZeroError`, so the
  // render fails where JS gives `Infinity` / `-Infinity` / `NaN`. Past that,
  // the runtime's `mod` keeps an int `0` for `-4 % 2` so the remainder still
  // indexes a list through `data_get`, which drops JS's `-0` sign.
  'number-division-zero-divisor': { limitation: 'division-zero-divisor' },
  'remainder-negative-zero-quotient': { limitation: 'division-zero-divisor' },
  // `remainder-nan-operand` used to sit here: PHP's `%` converted both
  // operands to integers, so `NaN % 2` rendered an integer. `%` now goes
  // through the runtime's `mod`, PHP's `fmod` (#3474).
  // `number-arithmetic-attr-exponent-boundaries` used to sit here: a number
  // at the 1e-6 / 1e21 boundary kept the host spelling. The runtime number
  // formatter now applies JavaScript's notation rules (#3380).

  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).

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
}

/**
 * Data points (`<fixture>:<point>`) that render divergent from the Hono
 * reference on this adapter while the fixture's primary render matches,
 * so the fixture itself is not in `renderDivergences`. The conformance
 * `skipDataPoints` set derives from the keys, and each entry cites the
 * limitation it is an instance of — same pattern as
 * `@barefootjs/go-template`'s `dataPointDivergences`.
 */
export const dataPointDivergences: Readonly<Record<string, { limitation: string }>> = {
}
