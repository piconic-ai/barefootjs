/**
 * Fixtures that compile clean on this adapter but render divergent from the
 * Hono reference on real Go. The conformance `skipJsx` set and
 * `packages/compat`'s published fixture-divergences both derive from this
 * one object, so the skip list and the declaration can't drift. Keep the
 * file even when the set is empty — the next divergence lands here, not in
 * a re-created file.
 *
 * (#2630's `static-array-from-props-with-component-precomputed` divergence
 * graduated once the harness (`test-render.ts`'s
 * `buildDynamicChildLoopSeeding`, despite the name — see its doc comment)
 * learned to seed a prop-backed static child-component loop's Props slice
 * the same way it already seeded a signal-backed dynamic one: the adapter's
 * own `emission` was never the bug, only this harness's route-handler
 * stand-in was missing the prop-derived case. The harness has since stopped
 * building a prop-backed loop's Props rows itself: it supplies the caller's
 * `<Name>s` Input rows and lets `NewXxxProps` build the rows, so the
 * constructor's own row loop — `BfDataKey` included — is executed here.)
 *
 * (#2703's `jsx-element-prop-fragment-conditional` divergence graduated by
 * reclassification, not a lowering fix: the underlying gap — a named
 * jsx-children prop whose value can't be baked into a static Go string
 * silently got no field at all, no diagnostic — is now a loud `BF101`
 * refusal (see `conformance-pins.ts`) instead of a silent wrong render.
 * "Compiles clean but renders divergent" no longer describes this fixture on
 * Go, so it moved off this table. Dynamic delivery for named jsx-children
 * props (the actual capability gap) is tracked separately at
 * https://github.com/piconic-ai/barefootjs/issues/2703.)
 *
 * (#2700's `signal-object-spread-init` divergence graduated the same way —
 * by reclassification, not a lowering fix: a `derived` signal/memo's
 * object-literal initializer referencing a live prop/signal has no
 * live-template-expression lowering on Go, only a static constructor-time
 * baker — now a loud `BF101` refusal (`conformance-pins.ts`) with a
 * verified `/* @client *\/` escape twin (`signal-object-spread-init-client`),
 * instead of a silent wrong render. Teaching the baker to emit
 * prop-referencing Go expressions — the actual capability gap — stays
 * tracked at https://github.com/piconic-ai/barefootjs/issues/2700.)
 *
 * (#2925's `component-prop-bare-getter` / `component-prop-getter-in-object-
 * literal` divergences graduated by an actual lowering fix, unlike #2703/
 * #2700 above: a local signal/memo getter's constructor-time seed IS
 * statically bakeable (the sibling top-level field bakes the same value
 * fine) — the nested-child-props baker just never tried a bare/wrapped
 * identifier operand. `resolveDynamicPropValue`'s bare-getter arm and
 * `ChildComponentShape.structTypedObjectParams` (`registerChildComponentShape`,
 * `objectBakeTargetFor`) now resolve both shapes against the same
 * `signalSeedGo`/`resolveLocalGetterAsGo` seeding the top-level field uses,
 * so `DisplayInput{ Value: 5 }` / `DisplayInput{ Value: DisplayValue{V: 5} }`
 * bake correctly instead of omitting the field.)
 *
 * (#3044's `nested-prop-object-array-with-component` was pinned here first,
 * then un-pinned in the same PR (#3048) once real `go run` verification
 * (a hand-written `main.go` populating `TagListInput.Tags` directly,
 * bypassing the harness) showed the ADAPTER'S OWN emission was never wrong:
 * `NewXxxProps` ranges over `.Tags` unconditionally, regardless of any other
 * field's type, and a real route handler populating it directly renders
 * correctly today. The empty render was `test-render.ts`'s own
 * `buildDynamicChildLoopSeeding`/`findLoopPropField` failing to resolve a
 * TWO-HOP prop-derived array (`data.entries`, where `data` — not `entries`
 * — is the destructured prop) — exactly #2630's original shape of gap, one
 * destructure-hop deeper. Same fix as #2630: teach the harness, not the
 * adapter — see `resolveNestedPropDerivedArrayValue`'s doc comment.)
 *
 * (`signal-optional-init`'s divergence graduated by an actual lowering
 * fix: `createSignal<string | undefined>('one')` seeded its Props field
 * from the union type (`interface{}`, `nil`) instead of the literal,
 * because `convertInitialValue`'s literal-union collapse deliberately left
 * a mixed nullish/primitive union alone and no primitive branch below it
 * matched. `unwrapNullableUnion` (`value/value-lowering.ts`) now takes the
 * single non-nullish primitive half for the literal-baking decision only —
 * the field stays `interface{}`-typed, so the `undefined` step of a
 * toggling signal keeps its `nil` zero value.)
 */

import type { RenderDivergences } from '@barefootjs/jsx'

// #2994 graduated both entries formerly here (`module-const-arrow-helper`,
// `module-function-helper-chain`): a module-scope helper call in a
// template position (arrow-valued const OR `function` declaration) now
// refuses loudly with BF101 at compile time instead of silently crashing
// `html/template` at render time — see `conformance-pins.ts`.
// #3062 graduated the entry formerly here for
// `composite-row-child-rest-bag-prop` (`loop-row-rest-bag-prop-override`):
// `loopRowChildPropOverrides` now delivers a rest-bag-routed per-row prop
// through `bf_with_bag`, the same route `queueDynamicPropDefine`'s static
// sibling already used, synced onto every render-consulted bag field
// (`restBagOverrideFields`, `lib/types.ts`) instead of leaving it
// undelivered.
// #3215 graduated `child-prop-rest-forward-undefined-start`
// (`go-undefined-signal-seed-not-nil`): `convertInitialValue` now keeps a
// nullable union's `undefined`/`null` initial value as the field's `nil`
// instead of baking the non-nullish branch's zero value (`""`), so the
// child's rest bag no longer receives `{"tag": ""}`.
// #3519 graduated `signal-prop-seed-logical-fallback`
// (`logical-signal-seed`): a signal seeded by a computed prop expression
// (`props.x || d`, `props.x && v`, `n * 2`) is now seeded by the runtime
// evaluator (`computedPropSeedGo`) instead of the bare prop or nil.
//
// #3532 graduated `signal-computed-prop-seed-absent`
// (`evaluated-nullish-absent-prop`): an optional prop under `??` in an
// evaluated seed takes the nillable field, so the evaluator gets `nil` for an
// absent one.
//
// #3572 graduated `children-renamed-param` (`renamed-children-param`): a
// children prop renamed in the parameter destructure (`{ children: kids }`)
// is held in the `Children` field the parent's children populate, not in a
// never-set field named after the local (`Kids`).
//
// #3699 graduated `jsx-prop-template-delimiters` (`nested-component-in-jsx-prop`):
// the components nested in a named JSX prop's companion define get their
// `<Name>SlotN` fields, a static child's `key` is stamped as its `BfDataKey`,
// and a literal child prop's string is escaped as a Go string literal.
//
// #3706 graduated `template-literal-attribute-quotes`: the literal segments
// of a template literal (outer and nested) are HTML-escaped where they land
// in markup outside a `{{…}}` action, so a `"` no longer closes the
// surrounding attribute.
export const renderDivergences: RenderDivergences = {
  // A JSX prop holding a nested component, forwarded by the receiving
  // component to a grandchild prop, renders nothing in the grandchild.
  'jsx-prop-nested-component-forwarded': { limitation: 'nested-component-in-jsx-prop-forwarded' },
  // `bf_json` (Go's `encoding/json`) writes the float `-0` that `bf_mod`
  // gives for a negative dividend as `-0`, where JS's `JSON.stringify`
  // writes `0`.
  'remainder-negative-zero-json': { limitation: 'negative-zero-json-stringify' },
  // `.at(i)` on half of a surrogate pair: the runtime string can't hold a
  // lone surrogate, so it returns U+FFFD (halves compare equal, and
  // rejoining them renders `��` instead of the emoji).
  'string-at-lone-surrogate': { limitation: 'string-at-lone-surrogate' },
  // A signal seeded from its own same-named prop keeps the prop's template
  // variable, so a raw `props.<name>` read beside it sees the derived value.
  'signal-from-same-named-prop-raw-read': { limitation: 'signal-from-same-named-prop-raw-read' },
  // A signal-array loop whose row is a child component with forwarded JSX
  // children: the constructor leaves a signal-backed loop's child Props slice
  // to the route handler, and a row with body children has no handler-side
  // construction, so the loop renders no rows.
  'signal-loop-row-child-children': { limitation: 'signal-loop-row-child-children-unseeded' },
  'loop-row-child-children-inner-loop-shadow': { limitation: 'signal-loop-row-child-children-unseeded' },
  'loop-row-child-children-handler': { limitation: 'signal-loop-row-child-children-unseeded' },
  'loop-row-child-children-ref': { limitation: 'signal-loop-row-child-children-unseeded' },
  'loop-row-nested-child-children-handler': { limitation: 'signal-loop-row-child-children-unseeded' },
  'loop-row-child-children-inner-loop-handler': { limitation: 'signal-loop-row-child-children-unseeded' },
  // A const reading a signal getter (`const b = count()`) read in a loop row
  // that binds the getter's name (`rows.map(count => …{b}…)`): the template
  // reads `b` as a variable that is never set.
  'const-getter-read-loop-shadowed': { limitation: 'loop-shadowed-const-alias-hop' },
  // A destructure default that calls a callback and reads no earlier prop
  // (`{ b = ['y', ''].filter((x) => x !== '') }`): the props constructor
  // has no conversion from the evaluated array to the field's slice type,
  // so it applies no default and an omitted prop renders empty.
  'destructure-default-body-renamed-callback': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-body-callback': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-param-renamed-callback': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-body-callback-shadow': { limitation: 'destructure-default-callback-unseeded' },
  // The parameter form read through a memo: the memo reads the binding
  // without the default too.
  'destructure-default-param-renamed-callback-memo': { limitation: 'destructure-default-callback-unseeded' },
  // A memo calling a local function named like a typed prop the body never
  // destructures: the server render reads the prop for the call.
  'memo-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // The same shape from markup: the server render reads the prop for the
  // call. From a signal seed it renders nothing.
  'markup-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  'signal-seed-local-function-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // A memo reading an ordinary const declared after it, or a module-scope
  // binding, named like a typed prop: the server render reads the prop.
  'memo-const-declared-after-named-like-prop': { limitation: 'local-function-named-like-prop' },
  'memo-module-binding-named-like-prop': { limitation: 'local-function-named-like-prop' },
  // A signal seeded from the binding (`createSignal(local.length)`), and an
  // identity memo over it (`createMemo(() => local)`): the Go seed reads the
  // Input field without the default. A memo the runtime evaluator computes
  // (`createMemo(() => local.length)`) applies it.
  'destructure-default-body-renamed-callback-signal': { limitation: 'destructure-default-callback-unseeded' },
  'destructure-default-body-renamed-callback-memo-chain': { limitation: 'destructure-default-callback-unseeded' },
  // `omitted-optional-number-arithmetic` used to sit here: an omitted
  // optional number prop read as `0` in arithmetic. A prop that can only be
  // absent now reads its nil as `undefined`, giving `NaN` (#3533).
  // `omitted-optional-nullable-number-arithmetic` used to sit here: an
  // omitted `n?: number | null` prop read as `0` in arithmetic. The type
  // cannot say which nil it stands for, so the arithmetic is now refused
  // with BF101 (`conformance-pins.ts`).
  // An explicit `null` (or an `undefined` a parent passed) carried by a
  // `{...props}` spread onto a child: the Input struct holds it and an
  // omitted prop as the same nil, so the spread carries the key only when it
  // is not nil and an earlier explicit prop keeps its value where JS
  // overrides it. The DSL runtimes record the keys each caller passed
  // (`passed`); the Input struct has no such record.
  'component-spread-explicit-null': { limitation: 'props-spread-explicit-null-override' },
  'component-spread-explicit-null-positions': { limitation: 'props-spread-explicit-null-override' },
  'component-spread-forwarded-null': { limitation: 'props-spread-explicit-null-override' },
  'component-spread-explicit-undefined-prop': { limitation: 'props-spread-explicit-null-override' },
  'component-prop-undefined-literal-spread': { limitation: 'props-spread-explicit-null-override' },
  // `number-division-zero-divisor`, `nullish-operand-division-remainder`,
  // `string-index-non-finite` and `remainder-negative-zero-quotient` used to
  // sit here: `bf_div` gave `0` for a zero divisor. It is now IEEE division,
  // `Infinity` / `-Infinity` / `NaN` as in JS, and keeps the sign of
  // `bf_mod`'s `-0` (#3692).
  // `remainder-nan-operand` used to sit here: `bf_mod` converted both
  // operands to `int`, so `NaN % 2` rendered an integer. It now computes
  // JS's truncated remainder (#3474).
  // `memo-prop-read-beside-signal-nullish-seed` used to sit here: a memo
  // reading an optional prop raw beside a signal seeded by `props.b ?? 'y'`
  // read the signal's hoisted fallback local. It now reads the prop's input
  // field, so an omitted prop is `undefined` / `NaN` (#3697).
  // `object-signal-field-length` used to sit here: `.length` on a loop
  // item's field inside a `.filter()` predicate never matched. It now reads
  // through `bf_length` inline and the evaluator counts a typed slice (#3447).
  // `undefined-signal-arithmetic-memo` used to sit here: arithmetic over an
  // `undefined`-initialized signal read the nil operand as `0` or threw. The
  // operand now goes through the runtime's JS `Number()`, giving `NaN` (#3390).
  // `nullish-optional-member-missing-field-attr` used to sit here: an object
  // signal's missing optional field rendered `data-name=""`. A field read
  // where `undefined` is observable is now `interface{}` (#3421).
  // `optional-chain-length-string-receiver` used to sit here: an absent
  // optional string prop read through `?.length` rendered `0`. An
  // optional-chain receiver prop is now `interface{}`, so the guard sees nil (#3422).
  // The `row-portal-ref*` fixtures used to sit here: a `ref`-callback portal
  // element in a loop row rendered inline in its row. It is now collected
  // with its row scope (`bfPortalHTMLIn`) and rendered at the outlet (#3420).
  // `fractional-number-array-row-ops` used to sit here: html/template's
  // native `gt`/`lt`/`eq` refused a float64 against an int literal.
  // Comparisons now go through `bf_eq`/`bf_gt`/… (`goComparisonCall`).
  // #3119 graduated dialog/dropdown-menu/popover/portal off
  // `ref-callback-portal-content-inline-at-ssr`: an `ssrPortalOwnerScope`
  // element (#3059's compiler-level recognition of the `ref`-callback
  // SSR-portal pattern) now stamps `bf-po` on its own tag and routes
  // through `.Portals.AddElement` (`go-template-adapter.ts`'s
  // `wrapSsrPortalElement`) instead of rendering inline — collected by
  // the (now RECURSIVELY propagated, `PropagatePortals` in
  // `runtime/bf.go`) `*bf.PortalCollector` and emitted at
  // `{{.Portals.Render}}`, an outlet the app's own layout places near
  // `</body>` (mirrors Hono's `<BfPortals />`). Verified against real
  // `go run` output for all four fixtures, matching the Hono reference's
  // `bf-po` values exactly (`dialog`: two levels of "use client" nesting
  // below the page root — DialogOverlay/DialogContent live inside
  // Dialog — which is why propagation had to go recursive, not just to
  // direct children).
  // `combobox` / `select` use the same `ref`-callback SSR-portal pattern
  // for their `Content`, and that part already renders `bf-po` correctly
  // here (`isSsrPortalRefCallback` walks through `SelectContent`'s
  // `queueMicrotask(() => createPortal(...))` deferral). They were pinned
  // only for `SelectTrigger`'s (and `ComboboxTrigger`'s)
  // `showPlaceholder={!value()}`, a unary-not prop value that used to be
  // dropped on the way into a child component's SSR constructor
  // (`emitStaticChildInstances` → `resolveDynamicPropValue`). Fixed: both
  // now render byte-identical to Hono with no pin.
  // `loop-row-child-children-attrs` used to sit here: #3164 fixed the loop-
  // array-source lookup (a function-body-local `const opts = [...]` now
  // bakes the same as a module-scope one), but `go run`-verifying the
  // fixture surfaced a SEPARATE, deeper gap — the row's forwarded `<a>`
  // reads the OUTER `active()` signal, and a static loop's forwarded
  // children render through a companion `{{define}}` executed via
  // `bf_tmpl` (`runtime/bf.go`'s `TemplateFuncMap`), a FRESH
  // `ExecuteTemplate` call whose data is the row's own item — Go's `$`
  // resets on every such call, so nothing inside that define can reach the
  // parent's `.Active` field at all. #3170 turned this from a silent
  // empty-loop divergence into a loud BF101 refusal
  // (`emitStaticBodyWrappers`'s `bodyChildrenReferenceOuterReactiveState`
  // guard) — the fixture no longer "compiles clean but renders divergent"
  // (this table's own definition), so it moved to `conformance-pins.ts`
  // instead. Reaching outer reactive state from a static loop's forwarded
  // children on Go remains its own, unsolved capability gap.
  // `loop-row-child-children-nested-reactive-prop` used to sit here: a
  // component nested in a loop-row child's forwarded children got its props
  // from a literal-only copy of the child-prop lowering, so `on={highlight()}`
  // fell back to Go's zero value. Every loop-row construction site now shares
  // `lowerChildInputFields` with the non-loop path; it renders like Hono.
  // A prop there that reads the ROW ITEM is re-applied per row inside the
  // row's forwarded-children define (`loop-row-child-children-nested-row-prop`
  // passes). `loop-row-child-children-nested-index-prop` and
  // `-preamble-prop` used to sit here: that define is a separate
  // `ExecuteTemplate` whose data is the row wrapper, so the index
  // (`{{range $index, …}}`) and a callback-body local (`{{$t := …}}`) were
  // out of reach. The call site now hands them over in the wrapper's
  // `BfRowVars` and the define rebinds them; both render like Hono.
  // `number-arithmetic-attr-formatting` used to sit here: an arithmetic
  // result in an ATTRIBUTE value is boxed as `any` by `bf_add`/`bf_div`/…
  // and html/template printed it in Go's `%v` exponent form. Attribute
  // values now share text position's `bf_string` sink
  // (`numericTextExpression`); it renders like Hono.
  // `data-url-attr-dynamic-value` used to sit here: `html/template` strips a
  // `data-` prefix before classifying an attribute, and escaped `data-src` /
  // `data-url` as URLs (`a%20b`, `#ZgotmplZ`). Such a name is now emitted
  // through `bf_attr_name` (`isGoNonPlainDataAttrName`); it renders like Hono.

  // `empty-array-condition` used to sit here: a bare value as a `{{if}}`
  // test used Go's built-in truthiness, which reads an empty slice as false.
  // It now goes through `bf_truthy` like `!x` (`lowerJsTruthyTest`).

  // `loop-row-child-children-prop-array-sibling-plural` used to sit here: a
  // sibling loop whose child's plural was another prop's field name
  // (`<Item>` → `Items` next to an `items` prop) took that field for its own
  // rows, so the `items` loop rendered empty. A loop's rows field is now
  // renamed when a different prop owns the plural (`nestedRowsFieldName`).
}

// #2943 graduated: a BODY-destructured prop's default now reaches
// `ParamInfo.defaultValue` directly (the analyzer overlays it onto
// `propsParams` at the binding's own declaration), so `extractSsrDefaults`
// seeds the evaluated default and the adapter's presence guard no longer
// treats the prop as defaultless — `data-label` now renders `'none'` here
// exactly like Hono, both for a plain default and a renamed one (the
// renamed shape also needed a duplicate-Input-field dedup and an
// `interface{}`-safe fallback extraction in `generateInputStruct` /
// `generatePropsStruct` — see their docstrings).

/**
 * Data points (`<fixture>:<point>`) that render divergent from the Hono
 * reference on real Go while the fixture's primary render matches, so the
 * fixture itself is not in `renderDivergences`. The conformance
 * `skipDataPoints` set derives from the keys, and each entry cites the
 * limitation it is an instance of: graduating (deleting) that entry fails
 * `go-template-adapter.test.ts`'s citation check until the skip goes too.
 */
export const dataPointDivergences: Readonly<Record<string, { limitation: string }>> = {
  // `.at(-1)` on an empty string is `undefined`, which omits the attribute
  // in JS; the template renders `data-last=""`.
  'string-index-methods:gen:word:empty': { limitation: 'undefined-method-result-attr' },
  // The same fixture's root called with `label: null`, forwarded through two
  // `{...props}` spreads: the second keeps its earlier `"first"`.
  'component-spread-forwarded-absent:gen:label:union:1': { limitation: 'props-spread-explicit-null-override' },
}
