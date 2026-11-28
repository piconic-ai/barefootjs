import { createFixture } from '../src/types'

/**
 * A keyed `.map()` row whose component's first element comes from a
 * nested component on some render paths only: a fragment that starts with
 * a component and then renders an element of its own, a fragment holding
 * only a component, a fragment nested in the root fragment, an `if`
 * statement and a fragment-root ternary that return a component in one
 * branch and an element in the other. SSR renders the row's `data-key` on
 * the component's own elements that carry the relay (the fragment's
 * element, the element branch), never on the nested component's root.
 */
export const fixture = createFixture({
  id: 'loop-row-root-component-branches',
  description: 'A keyed loop row whose first element comes from a nested component on some paths keys only its own elements',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Row = { id: string; kid: boolean }
function Kid(props: { label?: string }) {
  return <b>{props.label}</b>
}
function Lead(props: { label?: string }) {
  return <><Kid label={props.label} /><i>{props.label}</i></>
}
function Only(props: { label?: string }) {
  return <><Kid label={props.label} /></>
}
function Nested(props: { label?: string }) {
  return <><><Kid label={props.label} /></><i>{props.label}</i></>
}
function IfRoot(props: { label?: string; kid?: boolean }) {
  if (props.kid) return <Kid label={props.label} />
  return <i>{props.label}</i>
}
function TernaryRoot(props: { label?: string; kid?: boolean }) {
  return <>{props.kid ? <Kid label={props.label} /> : <i>{props.label}</i>}</>
}
export function Host(props: { rows: Row[] }) {
  const [rows] = createSignal(props.rows)
  return (
    <div>
      <ul>{rows().map((r) => <Lead key={r.id} label={r.id} />)}</ul>
      <ul>{rows().map((r) => <Only key={r.id} label={r.id} />)}</ul>
      <ul>{rows().map((r) => <Nested key={r.id} label={r.id} />)}</ul>
      <ul>{rows().map((r) => <IfRoot key={r.id} label={r.id} kid={r.kid} />)}</ul>
      <ul>{rows().map((r) => <TernaryRoot key={r.id} label={r.id} kid={r.kid} />)}</ul>
      <ol>{props.rows.map((r) => <IfRoot key={r.id} label={r.id} kid={r.kid} />)}</ol>
    </div>
  )
}
`,
  props: { rows: [{ id: 'a', kid: true }, { id: 'b', kid: false }] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <b bf-s="Lead_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="Lead_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ul>
      <ul bf="s3">
        <b bf-s="Only_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="Only_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </ul>
      <ul bf="s5">
        <b bf-s="Nested_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="Nested_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ul>
      <ul bf="s7">
        <b bf-s="IfRoot_*_s2" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf-s="IfRoot_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></i>
      </ul>
      <ul bf="s9">
        <!--bf-cond-start:s0-->
        <b bf-s="TernaryRoot_*_s1" bf="s1"><!--bf:s0-->a<!--/--></b>
        <!--bf-cond-end:s0-->
        <i bf-c="s0" bf="s3" data-key="b"><!--bf:s2-->b<!--/--></i>
      </ul>
      <ol bf="s11">
        <b bf-s="IfRoot_*_s2" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf-s="IfRoot_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></i>
      </ol>
    </div>
  `,
})
