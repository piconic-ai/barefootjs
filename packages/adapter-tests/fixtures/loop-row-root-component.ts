import { createFixture } from '../src/types'

/**
 * A keyed `.map()` row whose component renders another component as its
 * root (`<Inner key={x} />`, `Inner` returning `<Kid />`). The first
 * element of the row is the nested component's root, which SSR renders
 * without the row's `data-key`: the key relay lives on the elements of
 * `Inner`'s own markup that carry `IRElement.keyAttr`, and `Inner` has
 * none. Covered: a signal-driven and a static loop, a chain of two and
 * three components, a nested component with state of its own, and a row
 * passing more props than the forwarded one. The twin whose root is an
 * element (`Elem`) keeps its key.
 */
export const fixture = createFixture({
  id: 'loop-row-root-component',
  description: 'A keyed loop row whose component renders another component as its root renders no key on that component\'s element',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function Kid(props: { label?: string }) {
  return <b>{props.label}</b>
}
function StatefulKid(props: { label?: string }) {
  const [v] = createSignal(props.label ?? 'none')
  return <s>{v()}</s>
}
function Inner(props: { label?: string }) {
  return <Kid label={props.label} />
}
function Mid(props: { label?: string }) {
  return <Kid label={props.label} />
}
function Chain(props: { label?: string }) {
  return <Mid label={props.label} />
}
function MidTwo(props: { label?: string }) {
  return <Mid label={props.label} />
}
function ChainThree(props: { label?: string }) {
  return <MidTwo label={props.label} />
}
function ToStateful(props: { label?: string }) {
  return <StatefulKid label={props.label} />
}
function Extra(props: { label?: string; n?: number; on?: boolean }) {
  return <Kid label={props.on ? props.label : String(props.n)} />
}
function Elem(props: { label?: string }) {
  return <i>{props.label}</i>
}
export function Host(props: { items: string[] }) {
  const [items] = createSignal(props.items)
  return (
    <div>
      <ul>{items().map((x) => <Inner key={x} label={x} />)}</ul>
      <ol>{props.items.map((x) => <Inner key={x} label={x} />)}</ol>
      <p>{items().map((x) => <Chain key={x} label={x} />)}</p>
      <p>{items().map((x) => <ChainThree key={x} label={x} />)}</p>
      <p>{items().map((x) => <ToStateful key={x} label={x} />)}</p>
      <p>{items().map((x) => <Extra key={x} label={x} n={1} on />)}</p>
      <p>{items().map((x) => <Elem key={x} label={x} />)}</p>
    </div>
  )
}
`,
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <b bf-s="Inner_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="Inner_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </ul>
      <ol bf="s3">
        <b bf-s="Inner_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="Inner_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </ol>
      <p bf="s5">
        <b bf-s="Chain_*_s0_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="Chain_*_s0_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </p>
      <p bf="s7">
        <b bf-s="ChainThree_*_s0_s0_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="ChainThree_*_s0_s0_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </p>
      <p bf="s9">
        <s bf-s="ToStateful_*_s0" bf="s1"><!--bf:s0-->a<!--/--></s>
        <s bf-s="ToStateful_*_s0" bf="s1"><!--bf:s0-->b<!--/--></s>
      </p>
      <p bf="s11">
        <b bf-s="Extra_*_s0" bf="s1"><!--bf:s0-->a<!--/--></b>
        <b bf-s="Extra_*_s0" bf="s1"><!--bf:s0-->b<!--/--></b>
      </p>
      <p bf="s13">
        <i bf-s="Elem_*" bf="s1" data-key="a"><!--bf:s0-->a<!--/--></i>
        <i bf-s="Elem_*" bf="s1" data-key="b"><!--bf:s0-->b<!--/--></i>
      </p>
    </div>
  `,
})
