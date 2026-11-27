import { createFixture } from '../src/types'

/**
 * The calls of a component that forwards its children (or a JSX-valued
 * prop) into a nested component's prop whose value reaches that
 * component's state on every adapter: static text children, no children,
 * static markup children, static children of a call nested in a loop row,
 * a static JSX-valued prop, a loop row binding that shadows the forwarded
 * prop, and a nested prop no state is computed from. The twin of
 * `children-forwarded-into-child-prop-seed`.
 */
export const fixture = createFixture({
  id: 'children-forwarded-into-child-prop-delivered',
  description: 'Children a component forwards into a nested child\'s prop reach that child when they are delivered with the props',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Kid(props: { seed?: unknown }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <b>{v() === 'none' ? 'fallback' : 'children'}</b>
}
function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children} />
}
function ViaHeader(props: { header?: unknown }) {
  return <Kid seed={props.header} />
}
function Shadowed({ children, items }: { children?: unknown; items: string[] }) {
  return <ul>{items.map((children) => <li key={children}><Kid seed={children} /></li>)}</ul>
}
function Quiet(props: { seed?: unknown }) {
  const [v] = createSignal('quiet')
  return <s>{v()}</s>
}
function Toned(props: { children?: unknown }) {
  return <Quiet seed={props.children} />
}
export function Host(props: { label: string; items: string[] }) {
  return (
    <div>
      <Inner>own</Inner>
      <Inner />
      <Inner><i>own</i></Inner>
      <ol>{props.items.map((x) => <li key={x}><Inner>own</Inner></li>)}</ol>
      <ViaHeader header={<em>own</em>} />
      <Shadowed items={props.items}>{props.label}</Shadowed>
      <Toned>{props.label}</Toned>
    </div>
  )
}
`,
  props: { label: 'hi', items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s1_s0" bf="s1"><!--bf-cond-start:s0-->fallback<!--bf-cond-end:s0--></b>
      <b bf-s="test_s2_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <ol bf="s4">
        <li data-key="a"><b bf-s="test_s3_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s3_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ol>
      <b bf-s="test_s5_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <ul bf-s="test_s7" bf="s1">
        <li data-key="a"><b bf-s="test_s7_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s7_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ul>
      <s bf-s="test_s9_s0" bf="s1"><!--bf:s0-->quiet<!--/--></s>
    </div>
  `,
})
