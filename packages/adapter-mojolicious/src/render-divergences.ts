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
  // Markup calling a local function declaration that reads a component
  // local: the template reads the function's name as an unbound variable.
  'module-const-inherited-key-function': { limitation: 'local-function-call-unbound' },
  'module-const-inherited-key-function-direct': { limitation: 'local-function-call-unbound' },
  'module-const-inherited-key-function-nested': { limitation: 'local-function-call-unbound' },
  // A method call on a module array-literal const reads the const as an
  // unbound template variable.
  'module-const-array-method-call': { limitation: 'module-const-array-method-call' },
  // Markup reading, without calling it, a local function named like a typed
  // prop the body never binds: the template reads the prop of that name.
  'markup-local-function-read-named-like-prop': { limitation: 'local-function-read-named-like-prop' },
  // A const object whose members read a signal, passed bare as a child
  // component prop, reaches the child without its value.
  'signal-const-object-child-prop': { limitation: 'signal-const-object-child-prop' },
  // A const with a non-literal initializer (`new Map()`, an arrow) passed
  // bare as a child prop is read as an undeclared template variable.
  'const-object-prop-identity-hydrate': { limitation: 'non-literal-const-child-prop-unbound' },
  // A `.map()` callback destructuring `length` off a string or array row
  // reads the row's field, which a string or list does not have.
  'destructure-length-in-map': { limitation: 'destructured-length-on-string-or-array-row' },
  // A props object parameter not named `props` (`function C(p)`): its
  // members are not typed as the component's props, so `p.label + p.n`
  // does not concatenate (or the boolean `p.on` prints as `1`). Since the
  // runtime carries `undefined` (#3848 U5) an unproven `+` takes the
  // runtime's JS `plus`, so the concatenations render like Hono; the boolean
  // still prints as Perl's `1`.
  'props-object-non-props-name-operand-typing': { limitation: 'props-object-non-props-name-operand-typing' },
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
  // `boolean-logical-stringify` used to sit here: a stringified `&&` / `||`
  // over a boolean prop and a computed boolean rendered the native `1` its
  // last operand evaluates to. A name declared `boolean` now counts as a
  // boolean operand, so the expression prints through `bool_str` (#3443).
  // `falsy-row-clicks` used to sit here: a boolean row rendered its key and
  // `String(f)` as `0` / `1`. The runtime's `string` now prints a JSON
  // boolean as `true` / `false` (#3440).
  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).
  // `number-arithmetic-{attr,text}-exponent-boundaries` used to sit here:
  // Perl's `%.15g` padded a small exponent. An arithmetic result now prints
  // through `string`'s JS `Number::toString` (#3380).
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf->register_portal_element`/`bf->portals`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/mojo-adapter.ts`) and `register_portal_element`/`portals`
  // (`@barefootjs/perl`'s shared `BarefootJS.pm`).
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
  // `nullish-ternary-false-branch-attr` used to sit here: a taken `false`
  // branch next to a non-boolean branch lowered to Perl `0`. Such branches
  // are now rewritten to `'true'` / `'false'` (`stringifyBooleanBranches`);
  // it renders like Hono.
  'module-const-destructure-default': { limitation: 'module-const-destructure-default' },
  'module-const-default-hydrate': { limitation: 'module-const-destructure-default' },
  // `awaits-undefined-plus-shapes`, `destructure-default-null-hydrate` and
  // the `undef-null-*` fixtures used to sit here: the runtime held
  // `undefined` and `null` as one nil. It now carries `$BarefootJS::UNDEF`
  // apart from `undef` (#3848 U5), so each renders like Hono.
  // A default assigning an earlier binding (`b = (a = 2)`) never runs.
  'destructure-default-earlier-assignment': { limitation: 'destructure-default-assigns-earlier-binding' },
  // A `null` / `undefined` `style` object property renders `color:` with
  // an empty value instead of being dropped.
  'style-object-nil-property': { limitation: 'style-object-nil-property' },
  // A boolean loop-row member as an attribute value (`data-off={r.off}`)
  // prints Perl's `1` / `0`, not `true` / `false`.
  'loop-row-boolean-member-attr': { limitation: 'loop-row-boolean-member-attr-value' },
}

/**
 * Data points (`<fixture>:<point>`) that render divergent from the Hono
 * reference on real Mojolicious while the fixture's primary render matches,
 * so the fixture itself is not in `renderDivergences`. The conformance
 * `skipDataPoints` set derives from the keys, and each entry cites the
 * limitation it is an instance of — same pattern as
 * `@barefootjs/go-template`'s `dataPointDivergences`.
 */
export const dataPointDivergences: Readonly<Record<string, { limitation: string }>> = {
  // `signal-array-prop-fallback-seed-default:items-null` used to sit here:
  // the seed applied a destructure default to an explicit `null`. It now
  // applies only to an absent or `undefined` prop (#3848 U5).
}
