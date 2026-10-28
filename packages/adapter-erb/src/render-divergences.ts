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
// #3012 graduated `module-helper-boolcontext-call`: the `_boolContext`
// structural exemption (scoped by STRUCTURAL POSITION — any call inside a
// condition/ternary-test/unary-`!` operand — not by CALLEE IDENTITY) is
// removed entirely now that `isValidElement` (the one caller that
// legitimately needed it) is resolved as an identity-scoped
// `templatePrimitive` (`bf.is_element`, backed by a new Ruby port of the
// shared BarefootJS runtime's shape-check method) ahead of `call()`'s
// generic fallback. Every other bare-name call — including this fixture's
// non-`isValidElement` helper called from a ternary `test` — now refuses
// loudly with BF101 regardless of position, so this no longer renders
// divergent output; it fails to compile the same way
// `module-const-arrow-helper` / `module-function-helper-chain` already do
// — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // `===` / `!==` between objects or arrays compares contents, not references.
  'strict-equality-distinct-reference': { limitation: 'object-equality-by-contents' },
  // Ruby's `JSON.generate` writes the float `-0.0` that `%` gives for a
  // negative dividend as `-0.0`, where JS's `JSON.stringify` writes `0`.
  'remainder-negative-zero-json': { limitation: 'negative-zero-json-stringify' },
  // `.at(i)` on half of a surrogate pair: the runtime string can't hold a
  // lone surrogate, so it returns U+FFFD (halves compare equal, and
  // rejoining them renders `��` instead of the emoji).
  'string-at-lone-surrogate': { limitation: 'string-at-lone-surrogate' },
  // A const reading a signal getter (`const b = count()`) read in a loop row
  // that binds the getter's name (`rows.map(count => …{b}…)`): the template
  // reads `b` as a variable that is never set.
  'const-getter-read-loop-shadowed': { limitation: 'loop-shadowed-const-alias-hop' },
  // A memo calling a local function named like a typed prop the body never
  // destructures: the server render reads the prop for the call.
  'memo-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // The same shape from a signal seed and from markup: the server render
  // reads the prop for the call.
  'signal-seed-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  'markup-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // A memo reading an ordinary const declared after it, named like a typed
  // prop: the server render does not read the const.
  'memo-const-declared-after-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // `omitted-optional-number-arithmetic` used to sit here: an omitted
  // optional number prop read as `0` in arithmetic. A prop that can only be
  // absent now reads its nil as `undefined`, giving `NaN` (#3533).
  // `omitted-optional-nullable-number-arithmetic` used to sit here: an
  // omitted `n?: number | null` prop read as `0` in arithmetic. The type
  // cannot say which nil it stands for, so the arithmetic is now refused
  // with BF101 (`conformance-pins.ts`).
  // An explicit `null` carried by a `{...props}` spread onto a child: the
  // engine holds it and an omitted prop as the same nil, so the spread
  // carries the key only when it is not nil and an earlier explicit prop
  // keeps its value where JS overrides it with `null`.
  // `object-length-property-filter` used to sit here: an object row's own
  // `length` property read 0 in an inline filter predicate. The runtime
  // length helper now reads the object's property (#3449).
  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).
  // `number-arithmetic-attr-exponent-boundaries` used to sit here: a number
  // at the 1e-6 / 1e21 boundary kept the host spelling. The runtime number
  // formatter now applies JavaScript's notation rules (#3380).
  // `nullish-signal-arithmetic-memo` used to sit here: `s() * 2` with
  // `s()` = `null` raised on the nil operand. A possibly-nullish arithmetic
  // operand now reads as `0` (`coerceNullishOperand`); it renders like Hono.
  // `number-division-text` used to sit here: Ruby `/` on two Integers is
  // integer division. Division now goes through `bf.div` (JS semantics).
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/erb-adapter.ts`) and `register_portal_element`/`portals`
  // (`lib/barefoot_js.rb`).
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
