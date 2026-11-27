import { createFixture } from '../src/types'

/**
 * Components that test their children against `undefined` or `null`:
 * directly, through a signal seeded from them, and through a destructured
 * `children` binding. Each is called without children, with children and
 * with `children={null}`. A call without children reads `undefined`, and an
 * explicit `null` stays `null` (#3987).
 */
export const fixture = createFixture({
  id: 'children-absent-read-into-state',
  description: 'A component called without children reads props.children as undefined, and children={null} as null',
  source: `
import { Check, Seeded, Destructured, IsNull } from './note'
export function Host() {
  return (
    <div>
      <Check />
      <Check><i>c</i></Check>
      <Check children={null} />
      <Seeded />
      <Seeded><i>s</i></Seeded>
      <Destructured />
      <Destructured>d</Destructured>
      <IsNull />
      <IsNull children={null} />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Check(props: { children?: unknown }) {
  return <p>{props.children === undefined ? 'fallback' : 'children'}</p>
}
export function Seeded(props: { children?: unknown }) {
  const [v] = createSignal(props.children)
  return <u>{v() === undefined ? 'fallback' : 'children'}</u>
}
export function Destructured({ children }: { children?: unknown }) {
  return <s>{children === undefined ? 'fallback' : 'children'}</s>
}
export function IsNull(props: { children?: unknown }) {
  return <q>{props.children === null ? 'null' : 'not-null'}</q>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0">fallback</p>
      <p bf-s="test_s1">children</p>
      <p bf-s="test_s2">children</p>
      <u bf-s="test_s3" bf="s1"><!--bf-cond-start:s0-->fallback<!--bf-cond-end:s0--></u>
      <u bf-s="test_s4" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></u>
      <s bf-s="test_s5">fallback</s>
      <s bf-s="test_s6">children</s>
      <q bf-s="test_s7">not-null</q>
      <q bf-s="test_s8">null</q>
    </div>
  `,
})
