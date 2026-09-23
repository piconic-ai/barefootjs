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
 * stand-in was missing the prop-derived case.)
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
export const renderDivergences: RenderDivergences = {
  // A component-body const bound to an opaque call (`const label =
  // makeLabel()`) and invoked in text position lowers to a bare template
  // variable named after the const, with no diagnostic — the reference runs
  // the accessor at render time. Escape twin:
  // `opaque-local-accessor-call-client`.
  'opaque-local-accessor-call': { limitation: 'opaque-local-accessor-call' },
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
  // `combobox` / `select` were re-pinned here on the SAME assumption
  // (their `Content` element uses the identical `ref`-callback
  // SSR-portal pattern), but never re-verified against real `go run`
  // output. They in fact ALREADY render `bf-po` at the correct position,
  // byte-for-byte matching Hono — `isSsrPortalRefCallback`
  // (`jsx-to-ir.ts`) already walks through `SelectContent`'s
  // `queueMicrotask(() => createPortal(...))` deferral (see that
  // function's own docstring), and `wrapSsrPortalElement` is the same
  // shared, component-agnostic path #3119 built for the other four. The
  // portal divergence never applied to `combobox`/`select` here; the two
  // stayed skipped only because the compiled fixture failed elsewhere
  // (first the graduated `nested-child-static-prop-text-slot-elided`
  // marker bug, now the unrelated dynamic-boolean-prop gap below) the
  // whole time, so nobody re-ran them through Go to notice.
  //
  // What's ACTUALLY still wrong on Go for both: `SelectTrigger`'s
  // `showPlaceholder={!value()}` (and `ComboboxTrigger`'s twin) never
  // reaches the compiled `SelectTrigger`/`ComboboxTrigger` constructor at
  // all — the field is referenced correctly in the child's OWN template
  // (`{{if .ShowPlaceholder}}data-placeholder=...{{end}}`) but the
  // caller's (`SelectBasicDemo`'s) constructor never populates or
  // forwards it, so `data-placeholder` never renders regardless of
  // `value()`. Unrelated to the portal mechanism; tracked under
  // `nested-child-dynamic-boolean-prop-dropped`.
  combobox: { limitation: 'nested-child-dynamic-boolean-prop-dropped' },
  select: { limitation: 'nested-child-dynamic-boolean-prop-dropped' },
  // Go's manifestation is more severe than the shared entry's `actual`
  // describes (a frozen-but-present attribute): `NewLoopRowChildChildrenAttrsProps`
  // never populates the `Chips []...Ctx` slice field at all when the
  // loop's source array (`opts`) is a FUNCTION-BODY-local const — the
  // struct field exists but the constructor only bakes it when the same
  // array literal is declared at MODULE scope (verified directly: hoisting
  // `const opts = ['a', 'b']` out of the component function makes the
  // constructor emit `chipsData := []interface{}{"a", "b"}` and populate
  // `Chips` correctly). So on Go the whole loop is silently absent from
  // SSR, not just non-reactive after hydration — still an instance of the
  // same "loop-row-forwarded-children never track their own reactive data"
  // contract violation, just caught one step earlier (at construction
  // instead of at update).
  'loop-row-child-children-attrs': { limitation: 'loop-row-child-children-attrs-frozen' },
  // A signal seeded from an object prop's member (`createSignal(initial.label)`)
  // bakes `nil` into its own `interface{}` field: text reads render empty,
  // a conditional takes its falsy branch, a loop over it renders no rows.
  // Forwarded to a child's `string` Input field (`Label: nil`), `go run`
  // fails to compile `types.go`. Found by the explore harness's adapter
  // axis, where every scenario seeds its signals from an `initial` prop.
  'nested-prop-member-signal-seed': { limitation: 'nested-prop-member-signal-seed' },
  'nested-prop-signal-child-prop': { limitation: 'nested-prop-member-signal-seed' },
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
