/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference through the real `bf-render` minijinja binary. The
 * conformance `skipJsx` set and `packages/compat`'s published
 * fixture-divergences both derive from this one object, so the skip list
 * and the declaration can't drift. Keep the file even when the set is
 * empty — the next divergence lands here, not in a re-created file.
 * (`string-concat-plus` is NOT here — minijinja's `+` concatenates
 * strings, unlike Perl/PHP/Twig.)
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
// `templatePrimitive` (`bf.is_element`, backed by a new Rust `is_element`
// function in the shared runtime's shape-check surface) ahead of
// `call()`'s generic fallback. Every other bare-name call — including
// this fixture's non-`isValidElement` helper called from a ternary `test`
// — now refuses loudly with BF101 regardless of position, so this no
// longer renders divergent output; it fails to compile the same way
// `module-const-arrow-helper` / `module-function-helper-chain` already do
// — see `conformance-pins.ts`.
export const renderDivergences: RenderDivergences = {
  // A string and a number joined with `+` (`r.id + '-' + i`) is emitted as
  // the template language's own `+`, which raises a type error on a string
  // plus an integer instead of concatenating.
  'loop-row-child-concat-index-key': { limitation: 'string-number-plus-concat' },
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
  // `object-length-property-filter` used to sit here: an object row's own
  // `length` property read 0 in an inline filter predicate. The runtime
  // length helper now reads the object's property (#3449).
  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).
  // `nullish-signal-arithmetic-memo` used to sit here: `s() * 2` with
  // `s()` = `null` raised on the nil operand. A possibly-nullish arithmetic
  // operand now reads as `0` (`coerceNullishOperand`); it renders like Hono.
  // #3119 graduated `dialog`/`dropdown-menu`/`popover`/`portal`: an
  // `ssrPortalOwnerScope`-flagged element now stamps `bf-po` on its own
  // tag and routes through `bf.register_portal_element`/`bf.portals()`
  // instead of rendering inline — see `wrapSsrPortalElement`
  // (`adapter/minijinja-adapter.ts`) and `register_portal_element`/
  // `portals` (`runtime/src/runtime.rs`'s `RenderSession`/`BfInstance`).
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
