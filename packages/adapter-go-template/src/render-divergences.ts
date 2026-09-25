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
  // passes), but that define is a separate `ExecuteTemplate` whose data is
  // the row wrapper: the index (`{{range $index, …}}`) and a callback-body
  // local (`{{$t := …}}`) are out of reach, so a prop reading either keeps
  // the shared instance's zero value.
  'loop-row-child-children-nested-index-prop': { limitation: 'loop-row-child-nested-prop-reads-unreachable-row-binding' },
  'loop-row-child-children-nested-preamble-prop': { limitation: 'loop-row-child-nested-prop-reads-unreachable-row-binding' },
  // A component loop row whose callback destructures the row param renders
  // no rows (`({ id, tone }) => <Mark key={id} tone={tone} />`), or — with
  // forwarded children — rows without their `data-key` and without a
  // destructured field passed to a nested component (read as
  // `$__bf_item0.Tone`, a `{{range}}` variable the children define can't
  // reach).
  'loop-component-row-destructured-param': { limitation: 'loop-component-row-destructured-param' },
  'loop-row-child-children-nested-destructured-prop': { limitation: 'loop-component-row-destructured-param' },
  // `html/template` strips a `data-` prefix before classifying an attribute,
  // so `data-on…` escapes as an `on…` event-handler (JS) attribute: a dynamic
  // value renders as a quoted script string (`&#34;x&#34;`).
  'data-on-attr-dynamic-value': { limitation: 'data-on-attr-value-script-escaped' },

  // A literal-initialized `const` read as a ternary test is lowered as a
  // Props field read (`.On`, `.Mode`) the struct doesn't have, so
  // `html/template` fails at render time: "can't evaluate field On in type
  // main.…Props". Boolean literals fail at module or function scope; a
  // string literal only at function scope (a module-scope string const
  // renders like Hono).
  'const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
  'module-const-boolean-conditional-test': { limitation: 'literal-const-conditional-test' },
  'const-string-conditional-test': { limitation: 'literal-const-conditional-test' },
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
