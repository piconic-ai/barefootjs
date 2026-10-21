import { createFixture } from '../src/types'

/**
 * `signal-named-like-prop` in the other read positions: a condition, a
 * loop row, and a prop forwarded into a child component. Each position
 * reads both the signal `label()` and the prop `props.label`.
 */
export const fixture = createFixture({
  id: 'signal-named-like-prop-positions',
  description: 'A signal named like another prop stays apart in a condition, a loop row and a child prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Echo } from './echo'
export function SignalNamedLikePropPositions(props: { label?: string; b?: string; items?: string[] }) {
  const [label] = createSignal(props.b ?? '')
  return (
    <div>
      {label() ? <b>{label()}</b> : <i>{props.label}</i>}
      <ul>{(props.items ?? ['r']).map(x => <li key={x}>{x}:{label()}:{props.label}</li>)}</ul>
      <Echo v={label()} />
      <Echo v={props.label} />
    </div>
  )
}
`,
  components: {
    './echo.tsx': `
export function Echo(props: { v?: string }) {
  return <em>{props.v}</em>
}
`,
  },
  props: { label: 'P', b: 'B' },
  dataPoints: [
    { name: 'prop-only', props: { label: 'P' } },
    { name: 'seed-only', props: { b: 'B' } },
    { name: 'neither', props: {} },
    { name: 'two-rows', props: { label: 'P', b: 'B', items: ['x', 'y'] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s12">
      <b bf-c="s0" bf="s2"><!--bf:s1-->B<!--/--></b>
      <ul bf="s9"><li bf="s8" data-key="r"><!--bf:s5-->r<!--/-->:<!--bf:s6-->B<!--/-->:<!--bf:s7-->P<!--/--></li></ul>
      <em bf-s="test_s10" bf="s1"><!--bf:s0-->B<!--/--></em>
      <em bf-s="test_s11" bf="s1"><!--bf:s0-->P<!--/--></em>
    </div>
  `,
})
