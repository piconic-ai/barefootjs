import { createFixture } from '../src/types'

/**
 * The children prop read through a body const whose initializer gives it a
 * fallback (`const label = props.children ?? 'missing'`, `|| 'missing'`,
 * `?? ''`, over the destructured `children` too, and hopped again through
 * `const d = label`), rendered as text, at the top level and in a loop row
 * (where a row parameter of the same name shadows it), in a server and a
 * client component. Present children render as markup, an element, a
 * component and children with an expression alike; absent children render
 * the fallback as escaped text.
 */
export const fixture = createFixture({
  id: 'children-body-const-fallback-read',
  description: 'A body const of the children prop with a fallback keeps present children markup',
  source: `
import { Note, OrNote, Kids, Hop, Rows } from './note'
import { Live } from './live'
import { Leaf } from './leaf'
export function Host(props: { label: string }) {
  return (
    <div>
      <Note><i>a</i></Note>
      <Note><Leaf /></Note>
      <Note>{props.label}!</Note>
      <Note />
      <OrNote><i>b</i></OrNote>
      <OrNote />
      <Kids><i>c</i></Kids>
      <Kids />
      <Hop><i>d</i></Hop>
      <Hop />
      <Rows items={['<q>x</q>']}><i>e</i></Rows>
      <Rows items={['y']} />
      <Live><i>f</i></Live>
      <Live />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
export function Note(props: { children?: unknown }) {
  const label = props.children ?? '<s>missing</s>'
  return <b>{label}</b>
}
export function OrNote(props: { children?: unknown }) {
  const label = props.children || '<s>empty</s>'
  return <em>{label}</em>
}
export function Kids({ children }: { children?: unknown }) {
  const label = children ?? '<s>none</s>'
  return <u>{label}</u>
}
export function Hop(props: { children?: unknown }) {
  const label = props.children ?? '<s>hop</s>'
  const d = label
  const e = props.children ?? ''
  return <p>{d}|{e}</p>
}
export function Rows(props: { children?: unknown; items: string[] }) {
  const label = props.children ?? '<s>row</s>'
  return (
    <ul>
      {props.items.map((x) => <li key={x}>{label}</li>)}
      {props.items.map((label) => <li key={label}>{label}</li>)}
    </ul>
  )
}
`,
    './live.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Live(props: { children?: unknown }) {
  const [n, setN] = createSignal(0)
  const label = props.children ?? '<s>live</s>'
  return <section onClick={() => setN(n() + 1)}>{n()}{label}</section>
}
`,
    './leaf.tsx': `
export function Leaf() {
  return <span className="leaf">leaf</span>
}
`,
  },
  props: { label: 'hi' },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0"><i>a</i></b>
      <b bf-s="test_s2"><span bf-s="test_s1" class="leaf">leaf</span></b>
      <b bf-s="test_s4"><!--bf:^s3-->hi<!--/-->!</b>
      <b bf-s="test_s5">&lt;s&gt;missing&lt;/s&gt;</b>
      <em bf-s="test_s6"><i>b</i></em>
      <em bf-s="test_s7">&lt;s&gt;empty&lt;/s&gt;</em>
      <u bf-s="test_s8"><i>c</i></u>
      <u bf-s="test_s9">&lt;s&gt;none&lt;/s&gt;</u>
      <p bf-s="test_s10">
        <i>d</i>|<i>d</i>
      </p>
      <p bf-s="test_s11">&lt;s&gt;hop&lt;/s&gt;|</p>
      <ul bf-s="test_s12" bf="s1">
        <li data-key="&lt;q&gt;x&lt;/q&gt;"><i>e</i></li>
        <li data-key="&lt;q&gt;x&lt;/q&gt;"><!--bf:s0-->&lt;q&gt;x&lt;/q&gt;<!--/--></li>
      </ul>
      <ul bf-s="test_s13" bf="s1">
        <li data-key="y">&lt;s&gt;row&lt;/s&gt;</li>
        <li data-key="y"><!--bf:s0-->y<!--/--></li>
      </ul>
      <section bf-s="test_s14" bf="s1"><!--bf:s0-->0<!--/--><i>f</i></section>
      <section bf-s="test_s15" bf="s1"><!--bf:s0-->0<!--/-->&lt;s&gt;live&lt;/s&gt;</section>
    </div>
  `,
})
