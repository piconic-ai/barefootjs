/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Text::Xslate. The conformance `skipJsx` set and
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
// #2679 graduated (capture-before-shadow in `generateDerivedMemoSeed`,
// packages/adapter-xslate/src/adapter/memo/seed.ts): a self-referencing
// derived signal/memo now seeds a throwaway `__bf_seed_<name>` local from
// the RAW-stash-var Kolon lowering BEFORE `$<name>` is declared, then binds
// the real name off that capture — the same in-template recompute the other
// six template-stash backends already had. Keep the file even when the set
// is empty — the next divergence lands here, not in a re-created file.
// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's nullable-optional
// classification no longer treats the prop as defaultless — `data-label`
// now renders `'none'` here exactly like Hono, both for a plain default
// and a renamed one.
// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 instead of silently rendering empty — see
// `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // A memo whose quotient is an infinity (`count() / 0`, or a runtime zero
  // divisor), read directly or through another memo: renders Perl's `Inf` /
  // `-Inf` where JS renders `Infinity` / `-Infinity`. `NaN` matches (#3711).
  'memo-division-zero-divisor': { limitation: 'memo-non-finite-quotient' },
  // `.at(i)` on half of a surrogate pair: the runtime string can't hold a
  // lone surrogate, so it returns U+FFFD (halves compare equal, and
  // rejoining them renders `��` instead of the emoji).
  'string-at-lone-surrogate': { limitation: 'string-at-lone-surrogate' },
  // A signal seeded from its own same-named prop keeps the prop's template
  // variable, so a raw `props.<name>` read beside it sees the derived value.
  'signal-from-same-named-prop-raw-read': { limitation: 'signal-from-same-named-prop-raw-read' },
  // A const alias chain (`const a = children; const b = a`) read in a loop
  // row that binds a name the chain passes through (`rows.map(a => …{b}…)`):
  // the template cannot inline the const through the shadowed name, and the
  // const itself is never set, so the read renders nothing.
  'children-alias-hop-shadowed-intermediate': { limitation: 'loop-shadowed-const-alias-hop' },
  // A loop row parameter named `props` read through a member
  // (`rows.map((props) => …{props.label}…)`): the template reads
  // `props.label` as the root prop `label`, not the row item's member.
  'loop-param-named-props-member': { limitation: 'loop-param-named-props-member' },
  // A destructure default that calls a callback and reads no earlier prop
  // (`{ b = ['y', ''].filter((x) => x !== '') }`): the SSR seed has no
  // static value for it and the template applies no default, so an omitted
  // prop renders empty.
  'destructure-default-body-renamed-callback': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-body-callback': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-param-renamed-callback': { limitation: 'destructure-default-callback-unseeded' },
  // The parameter form read through a memo: the memo reads the binding
  // without the default too.
  'destructure-default-param-renamed-callback-memo': { limitation: 'destructure-default-callback-unseeded' },
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
  // `remainder-nan-operand` used to sit here: Kolon's `%` is Perl's integer
  // modulus, so `NaN % 2` rendered an integer. `%` now goes through the
  // runtime's `mod`, JS's truncated remainder (#3474).
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
  // `nullish-ternary-false-branch-attr` used to sit here: a taken `false`
  // branch next to a non-boolean branch lowered to Perl `0`. Such branches
  // are now rewritten to `'true'` / `'false'` (`stringifyBooleanTernaryBranches`);
  // it renders like Hono.

  // `memo-dependency-loop-shadow` used to sit here: a row param `label`
  // redeclared the template-level `my $label` the memo compiles to, which
  // Kolon refuses to parse. Such a memo is now declared and read as
  // `$__bf_memo_label` (`collectMemoKolonRenames`); it renders like Hono.

  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `$bf.register_portal_element`/`$bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/xslate-adapter.ts`) and `register_portal_element`/`portals`
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
  // `.at(-1)` on an empty string is `undefined`, which omits the attribute
  // in JS; the template renders `data-last=""`.
  'string-index-methods:gen:word:empty': { limitation: 'undefined-method-result-attr' },
}
