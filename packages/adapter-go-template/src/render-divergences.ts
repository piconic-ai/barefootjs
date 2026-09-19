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
export const renderDivergences: RenderDivergences = {
  // `loopRowChildPropOverrides` skips a prop that routes into the child's
  // rest bag (`routesToRestBag`), so the per-row value never reaches the
  // row: the child renders without the attribute at all. The out-of-loop
  // sibling route (`queueDynamicPropDefine` → `bf_with_bag`) is not wired
  // for loop rows yet.
  'composite-row-child-rest-bag-prop': { limitation: 'loop-row-rest-bag-prop-override' },
  // The nested-child-props baker has no arm for a ternary whose alternate is
  // `undefined` (`tag={shown() ? tag() : undefined}`): the prop gets no
  // field at all in `RestForwardTagInput{...}`, so the child's rest-bag
  // lookup renders `tag=""` whichever branch is taken, where the reference
  // renders `tag="one"` / no attribute. Measured under Go 1.25 (the version
  // gate in `test-render.ts` skips the render on older toolchains, which is
  // why a Go 1.24 host reports this fixture green).
  'child-prop-rest-forward': { limitation: 'child-prop-undefined-alternate-dropped' },
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
