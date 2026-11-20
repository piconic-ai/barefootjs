import { createFixture } from '../src/types'

/**
 * The calls of a component that seeds a signal from
 * `props.children ?? 'missing'` whose children reach that signal on every
 * adapter: static text children, no children, and static text children of
 * a call nested in a loop row's element. A signal named like the prop
 * that passes it through (`const [children] = createSignal(props.children)`,
 * with or without a `??` fallback) holds the prop's own value, so children
 * that read the caller's data reach it too; the transforming twin is
 * `children-read-into-state-shadow-transform`. The sibling of `children-dynamic-read-into-state` (#3961).
 */
export const fixture = createFixture({
  id: 'children-read-into-state-delivered',
  description: 'JSX children a component seeds a signal from reach that signal',
  source: `
'use client'
import { Note, Shadow, ShadowBare } from './note'
export function Host(props: { label: string; items: string[] }) {
  return (
    <div>
      <Note>own</Note>
      <Note />
      <ul>{props.items.map((x) => <li key={x}><Note>own</Note></li>)}</ul>
      <Shadow>{props.label}</Shadow>
      <Shadow />
      <ShadowBare>{props.label}</ShadowBare>
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note(props: { children?: unknown }) {
  const [value] = createSignal(props.children ?? 'missing')
  return <b>{value()}</b>
}
export function Shadow(props: { children?: unknown }) {
  const [children] = createSignal(props.children ?? 'missing')
  return <i>{children() === 'missing' ? 'fallback' : 'children'}</i>
}
export function ShadowBare(props: { children?: unknown }) {
  const [children] = createSignal(props.children)
  return <s>{children() ? 'children' : 'fallback'}</s>
}
`,
  },
  props: { label: 'hi', items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->own<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0-->missing<!--/--></b>
      <ul bf="s3">
        <li data-key="a"><b bf-s="test_s2" bf="s1"><!--bf:s0-->own<!--/--></b></li>
        <li data-key="b"><b bf-s="test_s2" bf="s1"><!--bf:s0-->own<!--/--></b></li>
      </ul>
      <i bf-s="test_s5" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></i>
      <i bf-s="test_s6" bf="s1"><!--bf-cond-start:s0-->fallback<!--bf-cond-end:s0--></i>
      <s bf-s="test_s8" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></s>
    </div>
  `,
})
