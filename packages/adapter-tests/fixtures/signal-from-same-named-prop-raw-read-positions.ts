import { createFixture } from '../src/types'

/**
 * `signal-from-same-named-prop-raw-read` in the other read positions: an
 * attribute, a template literal, a ternary, an `&&`, a string
 * concatenation, a loop row and a prop forwarded into a child component. Each position reads the raw
 * `props.label` beside the signal `label()` seeded from it.
 */
export const fixture = createFixture({
  id: 'signal-from-same-named-prop-raw-read-positions',
  description: 'A signal seeded from its same-named prop stays apart from the raw prop in every position',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Echo } from './echo'
export function SignalFromSameNamedPropRawReadPositions(props: { label?: string; items?: string[] }) {
  const [label] = createSignal(props.label ?? 'D')
  return (
    <div data-raw={props.label} data-sig={label()} data-t={\`t-\${props.label ?? '-'}-\${label()}\`}>
      {props.label ? <b>{props.label}</b> : <i>{label()}</i>}
      {props.label && <s>{props.label}</s>}
      <span>{'x' + (props.label ?? '-') + label()}</span>
      <ul>{(props.items ?? ['r']).map(x => <li key={x}>{x}:{label()}:{props.label}</li>)}</ul>
      <Echo v={props.label} />
      <Echo v={label()} />
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
  props: {},
  dataPoints: [
    { name: 'caller', props: { label: 'P' } },
    { name: 'empty', props: { label: '' } },
    { name: 'two-rows', props: { label: 'P', items: ['x', 'y'] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s17" data-sig="D" data-t="t---D">
      <i bf-c="s0" bf="s4"><!--bf:s3-->D<!--/--></i>
      <!--bf-cond-start:s5-->
      <!--bf-cond-end:s5-->
      <span bf="s9"><!--bf:s8-->x-D<!--/--></span>
      <ul bf="s14"><li bf="s13" data-key="r"><!--bf:s10-->r<!--/-->:<!--bf:s11-->D<!--/-->:<!--bf:s12--><!--/--></li></ul>
      <em bf-s="test_s15" bf="s1"><!--bf:s0--><!--/--></em>
      <em bf-s="test_s16" bf="s1"><!--bf:s0-->D<!--/--></em>
    </div>
  `,
})
