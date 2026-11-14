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
  // A method call on a module array-literal const reads the const as an
  // unbound template variable.
  'module-const-array-method-call': { limitation: 'module-const-array-method-call' },
  // Markup reading, without calling it, a local function named like a typed
  // prop the body never binds: the template reads the prop of that name.
  'markup-local-function-read-named-like-prop': { limitation: 'local-function-read-named-like-prop' },
  // A const object whose members read a signal, passed bare as a child
  // component prop, reaches the child without its value.
  'signal-const-object-child-prop': { limitation: 'signal-const-object-child-prop' },
  // A `.map()` callback destructuring `length` off a string or array row
  // reads the row's field, which a string or list does not have.
  'destructure-length-in-map': { limitation: 'destructured-length-on-string-or-array-row' },
  // `props-object-non-props-name-operand-typing` used to sit here: a props
  // object not named `props` left its members untyped, and the native `+`
  // over them did not concatenate. Since the runtime carries `undefined`
  // (#3848 U6) an unproven `+` takes the runtime's JS `plus`.
  // A prop the child does not declare, spread onto its root through
  // `{...props}`, is missing from the element.
  'child-undeclared-prop-whole-props-spread': { limitation: 'whole-props-spread-undeclared-prop' },
  // A boolean text child prints `true` / `false`; JSX renders nothing.
  // `.at(i)` on half of a surrogate pair: the runtime string can't hold a
  // lone surrogate, so it returns U+FFFD (halves compare equal, and
  // rejoining them renders `��` instead of the emoji).
  'string-at-lone-surrogate': { limitation: 'string-at-lone-surrogate' },
  // A const reading a signal getter (`const b = count()`) read in a loop row
  // that binds the getter's name (`rows.map(count => …{b}…)`): the template
  // reads `b` as a variable that is never set.
  'const-getter-read-loop-shadowed': { limitation: 'loop-shadowed-const-alias-hop' },
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
  // `number-division-zero-divisor` used to sit here: PHP's `/` threw
  // `DivisionByZeroError` on a zero divisor. `/` now goes through the
  // runtime's `div` (#3474).
  // `remainder-negative-zero-quotient` used to sit here: the runtime's `mod`
  // kept an int `0` for `-4 % 2`, which dropped JS's `-0` sign, so
  // `1 / (-4 % 2)` rendered `Infinity`. `mod` now keeps the float `-0.0`,
  // and index access reads it as `0` through the runtime's `index`
  // (#3698, #3744).
  // `remainder-nan-operand` used to sit here: PHP's `%` converted both
  // operands to integers, so `NaN % 2` rendered an integer. `%` now goes
  // through the runtime's `mod`, PHP's `fmod` (#3474).
  // `number-arithmetic-attr-exponent-boundaries` used to sit here: a number
  // at the 1e-6 / 1e21 boundary kept the host spelling. The runtime number
  // formatter now applies JavaScript's notation rules (#3380).

  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).

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
  // A default assigning an earlier binding (`b = (a = 2)`) never runs.
  'destructure-default-earlier-assignment': { limitation: 'destructure-default-assigns-earlier-binding' },
  // `awaits-undefined-plus-shapes`, `destructure-default-null-hydrate` and
  // the `undef-null-*` fixtures used to sit here: the runtime held
  // `undefined` and `null` as one nil. It now carries `Barefoot\Undefined`
  // apart from `null` (#3848 U6), so each renders like Hono.
  // A `null` / `undefined` `style` object property renders `color:` with
  // an empty value instead of being dropped.
  'style-object-nil-property': { limitation: 'style-object-nil-property' },
  // PHP adds two integers exactly past 2^53 (`2**53 + 1`), where JS rounds
  // the double: an accepted gap ("Decisions" (5) of
  // spec/js-primitive-semantics.md).
  'plus-beyond-safe-integer': { limitation: 'plus-beyond-safe-integer' },
  // A body rest over an open props type (`const { title, ...rest } = props`):
  // the template's rest bag holds only the keys the props type does not
  // declare, so the spread leaves out `tone`.
  'open-body-rest-spread-child-omits-keys': { limitation: 'open-body-rest-declared-key' },
  'open-body-rest-spread-element': { limitation: 'open-body-rest-declared-key' },
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
  // `signal-array-prop-fallback-seed-default:items-null` used to sit here:
  // the seed applied a destructure default to an explicit `null`. It now
  // applies only to an absent or `undefined` prop (#3848 U6).
}
