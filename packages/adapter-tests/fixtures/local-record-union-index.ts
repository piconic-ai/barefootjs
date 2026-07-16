import { createFixture } from '../src/types'

// #2300: a FUNCTION-LOCAL const `Record` indexed by a union-typed prop,
// used directly as an element's class value (not inside a template literal,
// and keyed by an object-style `props.placement` rather than a destructured
// binding). This is the class-composition surface the #2277
// `union-catalogued` fixture deliberately left out of scope (it kept to a
// direct `class={props.placement}` render to probe union value synthesis
// cleanly).
//
// On the typed struct backend (Go) this used to fail: the adapter lowered
// `placementClasses[props.placement]` to `{{index .PlacementClasses .Placement}}`
// but never declared or populated a `PlacementClasses` field — the
// function-local const `Record` is not a prop, and the string-typed
// derived-const path skips a non-string (object-literal) value — so Go raised
// `can't evaluate field PlacementClasses in type PlacementUnionProps`. The
// fix bakes the const `Record` as a populated `map[string]string` field so the
// `index` lookup resolves. The `dataPoints` exercise every union arm so the
// oracle comparison covers each key of the map.
export const fixture = createFixture({
  id: 'local-record-union-index',
  description: 'Function-local const Record indexed by a union prop, used as a class value',
  source: `
export function PlacementUnion(props: { placement: 'top' | 'right' | 'bottom' }) {
  const placementClasses: Record<'top' | 'right' | 'bottom', string> = {
    top: 'placement-top',
    right: 'placement-right',
    bottom: 'placement-bottom',
  }
  return <div className={placementClasses[props.placement]}>hi</div>
}
`,
  props: { placement: 'top' },
  expectedHtml: `
    <div bf-s="test" bf="s0" class="placement-top">hi</div>
  `,
  dataPoints: [
    { name: 'placement-right', props: { placement: 'right' } },
    { name: 'placement-bottom', props: { placement: 'bottom' } },
  ],
})
