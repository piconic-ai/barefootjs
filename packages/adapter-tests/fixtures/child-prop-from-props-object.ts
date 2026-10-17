import { createFixture } from '../src/types'

/**
 * A child component prop computed from a props-object read: the expression
 * itself (`text={props.label ?? 'Default'}`), a non-colliding const holding
 * it, and a const that shadows the prop with a default. Go left the first
 * two out of the child's constructor input (the evaluator had no value for
 * `props`) and read the third as the bare prop, dropping its default, so the
 * child rendered empty with `label` omitted (#3507).
 */
export const fixture = createFixture({
  id: 'child-prop-from-props-object',
  description: 'A child prop computed from a props-object read (directly or through a const) is seeded on every backend',
  source: `
'use client'
function Badge(props: { text: string }) {
  return <b>{props.text}</b>
}
export function Card(props: { label?: string }) {
  const shown = props.label ?? 'Shown'
  const label = props.label ?? 'Shadowed'
  return (
    <div>
      <Badge text={props.label ?? 'Default'} />
      <Badge text={shown} />
      <Badge text={label} />
    </div>
  )
}
`,
  componentName: 'Card',
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->Default<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0-->Shown<!--/--></b>
      <b bf-s="test_s2" bf="s1"><!--bf:s0-->Shadowed<!--/--></b>
    </div>
  `,
  dataPoints: [
    { name: 'label-given', props: { label: 'Given' } },
  ],
})
