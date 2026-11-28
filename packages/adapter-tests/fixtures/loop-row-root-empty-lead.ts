import { createFixture } from '../src/types'

/**
 * A keyed `.map()` row whose component's fragment root starts with
 * something that can render no element (an empty fragment, an empty
 * fragment nested in another, a `null` child, a `&&` that renders nothing,
 * a loop over an empty list) before a nested component and a later element
 * of its own. SSR renders the row's `data-key` on the component's own relay
 * carrier (the later `<i>`, or the `&&` branch's `<u>`), never on the
 * nested component's root, whether the leading child renders or not.
 */
export const fixture = createFixture({
  id: 'loop-row-root-empty-lead',
  description: 'A keyed loop row whose fragment root starts with a child that can render nothing keys only its own elements',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Kid(props: { label?: string }) {
  return <b>{props.label}</b>
}
function EmptyLead(props: { label?: string }) {
  return <><></><Kid label={props.label} /><i>{props.label}</i></>
}
function NestedEmptyLead(props: { label?: string }) {
  return <><><></></><Kid label={props.label} /><i>{props.label}</i></>
}
function NullLead(props: { label?: string }) {
  return <>{null}<Kid label={props.label} /><i>{props.label}</i></>
}
function CondLead(props: { label?: string; on?: boolean }) {
  return <>{props.on && <u>on</u>}<Kid label={props.label} /><i>{props.label}</i></>
}
function LoopLead(props: { label?: string; tags?: string[] }) {
  return <>{(props.tags ?? []).map((t) => <u key={t}>{t}</u>)}<Kid label={props.label} /><i>{props.label}</i></>
}
export function Host(props: { items: string[] }) {
  const [items] = createSignal(props.items)
  return (
    <div>
      <ul>{items().map((x) => <EmptyLead key={x} label={x} />)}</ul>
      <ul>{items().map((x) => <NestedEmptyLead key={x} label={x} />)}</ul>
      <ul>{items().map((x) => <NullLead key={x} label={x} />)}</ul>
      <ul>{items().map((x) => <CondLead key={x} label={x} />)}</ul>
      <ul>{items().map((x) => <CondLead key={x} label={x} on />)}</ul>
      <ul>{items().map((x) => <LoopLead key={x} label={x} />)}</ul>
      <ul>{items().map((x) => <LoopLead key={x} label={x} tags={['t']} />)}</ul>
      <ol>{props.items.map((x) => <EmptyLead key={x} label={x} />)}</ol>
    </div>
  )
}
`,
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <b bf-s="EmptyLead_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="EmptyLead_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ul>
      <ul bf="s3">
        <b bf-s="NestedEmptyLead_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="NestedEmptyLead_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ul>
      <ul bf="s5">
        <b bf-s="NullLead_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="NullLead_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ul>
      <ul bf="s7">
        <!--bf-cond-start:s0-->
        <!--bf-cond-end:s0-->
        <b bf-s="CondLead_*_s1" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s3"><!--bf:s2-->a<!--/--></i>
        <!--bf-cond-start:s0-->
        <!--bf-cond-end:s0-->
        <b bf-s="CondLead_*_s1" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s3"><!--bf:s2-->b<!--/--></i>
      </ul>
      <ul bf="s9">
        <u bf-c="s0" data-key="a">on</u>
        <b bf-s="CondLead_*_s1" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s3"><!--bf:s2-->a<!--/--></i>
        <u bf-c="s0" data-key="b">on</u>
        <b bf-s="CondLead_*_s1" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s3"><!--bf:s2-->b<!--/--></i>
      </ul>
      <ul bf="s11">
        <b bf-s="LoopLead_*_s1" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s3" data-key="a"><!--bf:s2-->a<!--/--></i>
        <b bf-s="LoopLead_*_s1" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s3" data-key="b"><!--bf:s2-->b<!--/--></i>
      </ul>
      <ul bf="s13">
        <u data-key="t"><!--bf:s0-->t<!--/--></u>
        <b bf-s="LoopLead_*_s1" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s3" data-key="a"><!--bf:s2-->a<!--/--></i>
        <u data-key="t"><!--bf:s0-->t<!--/--></u>
        <b bf-s="LoopLead_*_s1" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s3" data-key="b"><!--bf:s2-->b<!--/--></i>
      </ul>
      <ol bf="s15">
        <b bf-s="EmptyLead_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <i bf="s2" data-key="a"><!--bf:s1-->a<!--/--></i>
        <b bf-s="EmptyLead_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
        <i bf="s2" data-key="b"><!--bf:s1-->b<!--/--></i>
      </ol>
    </div>
  `,
})
