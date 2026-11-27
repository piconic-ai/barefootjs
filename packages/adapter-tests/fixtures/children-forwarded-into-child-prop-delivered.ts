import { createFixture } from '../src/types'

/**
 * The calls of a component that forwards its children (or a JSX-valued
 * prop) into a nested component's prop whose value reaches that
 * component's state on every adapter: static text children, no children,
 * static markup children, static children of a call nested in a loop row,
 * a static JSX-valued prop, a loop row binding that shadows the forwarded
 * prop, a nested prop no state is computed from, a static bracket read of
 * static children, a const read in a loop row whose own parameter shadows
 * the const, and through `{...props}`: a static JSX-valued prop the spread
 * carries, and an explicit writer the spread replaces (a required param, or
 * an optional one the call passes, including an explicit override of a
 * fallback the next component's spread replaces). The twin of
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
function ViaBracket(props: { children?: unknown }) {
  return <Kid seed={props['children']} />
}
function RowShadowsConst({ children, items }: { children?: unknown; items: string[] }) {
  const captured = children
  return <ul>{items.map((captured) => <li key={captured}><Kid seed={captured} /></li>)}</ul>
}
function SpreadSeed(props: { seed?: unknown }) {
  return <Kid {...props} />
}
function SpreadRequired(props: { children?: unknown; seed: unknown }) {
  return <Kid seed={props.children} {...props} />
}
function SpreadPassed(props: { children?: unknown; seed?: unknown }) {
  return <Kid seed={props.children} {...props} />
}
function Mid(props: { forwarded?: unknown; seed?: unknown }) {
  return <Kid seed={props.forwarded} {...props} />
}
function Overrides(props: { children?: unknown }) {
  return <Mid forwarded={props.children} seed="override" />
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
      <ViaBracket>own</ViaBracket>
      <RowShadowsConst items={props.items}>{props.label}</RowShadowsConst>
      <SpreadSeed seed={<em>own</em>} />
      <SpreadRequired seed="x">{props.label}</SpreadRequired>
      <SpreadPassed seed="x">{props.label}</SpreadPassed>
      <Overrides>{props.label}</Overrides>
      <Mid forwarded={<em>{props.label}</em>} seed="x" />
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
      <b bf-s="test_s10_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <ul bf-s="test_s12" bf="s1">
        <li data-key="a"><b bf-s="test_s12_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s12_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ul>
      <b bf-s="test_s13_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s15_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s17_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s19_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s22_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
    </div>
  `,
})
