import { createFixture } from '../src/types'

/**
 * The ways a component can compute state from JSX children that read the
 * caller's data: a bare signal seed, a memo, a memo over that memo, a
 * destructured (and renamed) `children` binding, an explicit `string`
 * signal type, and a JSX-valued prop other than `children`. Each holds
 * the children the call passes, not the fallback (#3961); the child renders
 * a test of the value, as in `children-dynamic-read-into-state`.
 */
export const fixture = createFixture({
  id: 'children-read-into-state-forms',
  description: 'Every way of computing state from dynamic JSX children sees those children',
  source: `
'use client'
import { Bare, Memo, MemoOfMemo, Destructured, Renamed, Typed, Header } from './note'
export function Host(props: { label: string }) {
  return (
    <div>
      <Bare>{props.label}</Bare>
      <Memo>{props.label}</Memo>
      <MemoOfMemo>{props.label}</MemoOfMemo>
      <Destructured>{props.label}</Destructured>
      <Renamed>{props.label}</Renamed>
      <Typed>{props.label}</Typed>
      <Header header={<i>{props.label}</i>} />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function Bare(props: { children?: unknown }) {
  const [value] = createSignal(props.children)
  return <b>{value() ? 'children' : 'fallback'}</b>
}
export function Memo(props: { children?: unknown }) {
  const value = createMemo(() => props.children ?? 'missing')
  return <i>{value() === 'missing' ? 'fallback' : 'children'}</i>
}
export function MemoOfMemo(props: { children?: unknown }) {
  const inner = createMemo(() => props.children)
  const value = createMemo(() => inner() ?? 'missing')
  return <u>{value() === 'missing' ? 'fallback' : 'children'}</u>
}
export function Destructured({ children }: { children?: unknown }) {
  const [value] = createSignal(children ?? 'missing')
  return <s>{value() === 'missing' ? 'fallback' : 'children'}</s>
}
export function Renamed({ children: kids }: { children?: unknown }) {
  const [value] = createSignal(kids ?? 'missing')
  return <em>{value() === 'missing' ? 'fallback' : 'children'}</em>
}
export function Typed(props: { children?: string }) {
  const [value] = createSignal<string>(props.children ?? 'missing')
  return <strong>{value() === 'missing' ? 'fallback' : 'children'}</strong>
}
export function Header(props: { header?: unknown }) {
  const [value] = createSignal(props.header ?? 'none')
  return <h2>{value() === 'none' ? 'fallback' : 'children'}</h2>
}
`,
  },
  props: { label: 'hi' },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s1" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <i bf-s="test_s3" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></i>
      <u bf-s="test_s5" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></u>
      <s bf-s="test_s7" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></s>
      <em bf-s="test_s9" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></em>
      <strong bf-s="test_s11" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></strong>
      <h2 bf-s="test_s14" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></h2>
    </div>
  `,
})
