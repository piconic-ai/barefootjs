import { createFixture } from '../src/types'

/**
 * The catalogued union type (#2277) as a data-point prop: a string-literal
 * union (`'top' | 'right' | 'bottom'`) rendered directly in both a `class`
 * attribute and a text node, so every synthesized member (`gen:placement:
 * union:<member>`) is compared against the JS reference on each adapter.
 *
 * Uses `props: Type` (not destructured) so the compiler resolves the FULL
 * union `TypeInfo` — a destructured `{ placement }: Props` binding degrades
 * non-primitive members to `kind:'unknown'` via `collectMemberTypes`, so
 * the catalogue would synthesize nothing (see `adversarial-catalog.ts`'s
 * `PropParamType` docstring; the destructured-union gap is tracked
 * separately).
 *
 * Kept to a direct union render — NOT the `placementClasses[props.placement]`
 * `Record<Union, string>` class-composition pattern the issue also names —
 * so this fixture cleanly probes union *value synthesis* on every adapter.
 * The class-composition surface is a separate, divergence-prone lowering
 * (a function-local const `Record` indexed by a union prop currently fails
 * to render on the Go adapter, #2300) and is out of this fixture's scope.
 *
 * `placement` is required (no `?`), so the catalogue contributes one
 * `gen:placement:union:<member>` point per literal member — `right` /
 * `bottom` (`top` reproduces the primary props and is deduped) — with no
 * `absent` point (that's only emitted for an optional prop).
 */
export const fixture = createFixture({
  id: 'union-catalogued',
  description: 'Union-typed prop rendered in class + text position, one point per member',
  source: `
function PlacementUnion(props: { placement: 'top' | 'right' | 'bottom' }) {
  return <div class={props.placement}>{props.placement}</div>
}
export { PlacementUnion }
`,
  props: { placement: 'top' },
  expectedHtml: `
    <div bf-s="test" bf="s1" class="top"><!--bf:s0-->top<!--/--></div>
  `,
})
