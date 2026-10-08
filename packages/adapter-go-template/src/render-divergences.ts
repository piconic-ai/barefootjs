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
export const renderDivergences: RenderDivergences = {
  // `s() * 2` with `s()` = `undefined`: JS renders `NaN`, the template's nil
  // operand throws or reads as `0` here (#3350 covers only `null`).
  'undefined-signal-arithmetic-memo': { limitation: 'undefined-signal-arithmetic-not-nan' },
  // `blank()?.name` with `blank()` = `{}` typed `User`: the struct's
  // `Name string` field reads as `""`, not nil, so the nil guard keeps
  // `data-name=""` where JS reads `undefined` and omits it (#3322).
  'nullish-optional-member-missing-field-attr': { limitation: 'optional-struct-field-absent-renders-zero' },
  // `createSignal<string | undefined>(initial.label)` with `initial` = `{}`:
  // `Init.Label` is a plain `string`, so the absent member seeds `""` and
  // the nil guard keeps `title=""` (#3323's member half).
  'member-seeded-nullable-signal-attr': { limitation: 'optional-struct-field-absent-renders-zero' },
  // `{props.noText?.length}` with `noText` absent: the props struct's
  // `NoText string` reads as `""`, so the nil guard on `?.length` sees a
  // present empty string and renders `0` where JS renders nothing (#3332).
  'optional-chain-length-string-receiver': { limitation: 'optional-struct-field-absent-renders-zero' },
  // `(props.c ?? props.a).length` with `c` = `[]`: `??` lowers to
  // `or .C .A`, and `or` treats the empty slice as falsy, so it reads `a`'s
  // length (`2`) where JS keeps `c` and reads `0`.
  'nullish-coalesce-empty-array': { limitation: 'nullish-coalesce-empty-array-falls-back' },
  // A `ref`-callback portal element in a loop row renders inline in its row
  // (`{{range}}` rebinds `.` to the row item), not at the portal outlet
  // (#3318).
  'row-portal-ref': { limitation: 'loop-row-portal-renders-inline' },
  'row-portal-ref-remove': { limitation: 'loop-row-portal-renders-inline' },
  'row-portal-ref-static': { limitation: 'loop-row-portal-renders-inline' },
  'row-portal-ref-branch': { limitation: 'loop-row-portal-renders-inline' },
  'row-portal-ref-composite': { limitation: 'loop-row-portal-renders-inline' },
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
  // The same `??`-over-`[]` fallback as `nullish-coalesce-empty-array`,
  // reached through the generated `c` = `[]` point of
  // `(props.c ?? props.a)?.length`.
  'optional-chain-length-composed-receiver:gen:c:empty': { limitation: 'nullish-coalesce-empty-array-falls-back' },
}
