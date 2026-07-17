import { createFixture } from '../src/types'

// #2300: a FUNCTION-LOCAL const `Record` indexed by a union-typed prop,
// used directly as an element's class value — a BARE `class={record[key]}`,
// not wrapped in a template literal. This is the class-composition surface the
// #2277 `union-catalogued` fixture deliberately left out of scope (it kept to a
// direct `class={props.placement}` render to probe union value synthesis
// cleanly).
//
// This used to render empty (or error) on the typed / strict backends (Go,
// minijinja, ERB, Jinja): the analyzer left the bare form as a raw index
// access, which those backends treated as a prop-field reference to a field
// that was never declared (Go raised `can't evaluate field PlacementClasses`).
// The `${record[key]}` template-literal form already lifts into a structured
// `lookup` IR part every adapter renders correctly; the fix routes the bare
// form through that same path, so `class={record[key]}` and
// `class={`${record[key]}`}` compile identically on every backend (on Go the
// `lookup` renders as a case chain over the union arms). The `dataPoints`
// exercise every union arm so the oracle comparison covers each case.
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
