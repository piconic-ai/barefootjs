import { createFixture } from '../src/types'

/**
 * Text children that read the caller's data, passed to a component that
 * holds them in state and prints that state. JSX renders the children node,
 * with the caller's text slot markers, inside the component, the way it
 * renders an element child read into state (`children-element-read-into-state`).
 * Covered for a lone string and number expression, text around an
 * expression, two expressions, text next to an element, a seed with a `??`
 * fallback, a `??` memo, children a component forwards from its own
 * children, children forwarded into a nested component's prop, a call in a
 * loop row (nested in the row's element, and as the row itself), and, as
 * controls, static text children and a `children` attribute holding text
 * that looks like markup, which stays escaped text.
 */
export const fixture = createFixture({
  id: 'children-text-read-into-state',
  description: 'Dynamic text children a component prints from state render as the children node',
  source: `
'use client'
import { Note, Fallback, Memo, Kid } from './note'
function Relay(props: { children?: unknown }) {
  return <p><Note>{props.children}!</Note></p>
}
function Inner(props: { children?: unknown }) {
  return <Kid seed={props.children} />
}
export function Host(props: { label: string; count: number; items: string[] }) {
  return (
    <div>
      <Note>{props.label}</Note>
      <Note>{props.count}</Note>
      <Note>{props.label}!</Note>
      <Note>{props.label} and {props.count}</Note>
      <Note>{props.label} <i>x</i></Note>
      <Fallback>{props.label}</Fallback>
      <Memo>{props.label}</Memo>
      <Relay>{props.label}</Relay>
      <Inner>{props.label}</Inner>
      <ul>{props.items.map((x) => <li key={x}><Note>{x}</Note></li>)}</ul>
      <section>{props.items.map((x) => <Note key={x}>{x}</Note>)}</section>
      <Note>static</Note>
      <Note children="a<b" />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function Note(props: { children?: unknown }) {
  const [value, setValue] = createSignal(props.children)
  return <b onClick={() => setValue('clicked')}>{value()}</b>
}
export function Fallback(props: { children?: unknown }) {
  const [value] = createSignal(props.children ?? 'missing')
  return <i>{value()}</i>
}
export function Memo(props: { children?: unknown }) {
  const value = createMemo(() => props.children ?? 'missing')
  return <u>{value()}</u>
}
export function Kid(props: { seed?: unknown }) {
  const [value] = createSignal(props.seed ?? 'none')
  return <s>{value()}</s>
}
`,
  },
  props: { label: 'hi', count: 3, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s1" bf="s1"><!--bf:s0--><!--bf:^s0-->hi<!--/--><!--/--></b>
      <b bf-s="test_s3" bf="s1"><!--bf:s0--><!--bf:^s2-->3<!--/--><!--/--></b>
      <b bf-s="test_s5" bf="s1"><!--bf:s0--><!--bf:^s4-->hi<!--/-->!<!--/--></b>
      <b bf-s="test_s8" bf="s1"><!--bf:s0--><!--bf:^s6-->hi<!--/--> and <!--bf:^s7-->3<!--/--><!--/--></b>
      <b bf-s="test_s10" bf="s1"><!--bf:s0--><!--bf:^s9-->hi<!--/--><i>x</i><!--/--></b>
      <i bf-s="test_s12" bf="s1"><!--bf:s0--><!--bf:^s11-->hi<!--/--><!--/--></i>
      <u bf-s="test_s14" bf="s1"><!--bf:s0--><!--bf:^s13-->hi<!--/--><!--/--></u>
      <p bf-s="test_s16"><b bf-s="test_s16_s0" bf="s1"><!--bf:s0--><!--bf:^s15-->hi<!--/-->!<!--/--></b></p>
      <s bf-s="test_s18_s0" bf="s1"><!--bf:s0--><!--bf:^s17-->hi<!--/--><!--/--></s>
      <ul bf="s21">
        <li data-key="a"><b bf-s="test_s20" bf="s1"><!--bf:s0--><!--bf:^s19-->a<!--/--><!--/--></b></li>
        <li data-key="b"><b bf-s="test_s20" bf="s1"><!--bf:s0--><!--bf:^s19-->b<!--/--><!--/--></b></li>
      </ul>
      <section bf="s24">
        <b bf-s="Note_*" bf="s1" data-key="a"><!--bf:s0--><!--bf:^s22-->a<!--/--><!--/--></b>
        <b bf-s="Note_*" bf="s1" data-key="b"><!--bf:s0--><!--bf:^s22-->b<!--/--><!--/--></b>
      </section>
      <b bf-s="test_s25" bf="s1"><!--bf:s0-->static<!--/--></b>
      <b bf-s="test_s26" bf="s1"><!--bf:s0-->a&lt;b<!--/--></b>
    </div>
  `,
})
