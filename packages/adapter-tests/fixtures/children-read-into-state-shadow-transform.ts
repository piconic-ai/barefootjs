import { createFixture } from '../src/types'

/**
 * A signal or memo named like the children prop that transforms it
 * (`const [children] = createSignal(props.children ? 'given' : 'none')`), called
 * with children that read the caller's data. The state holds the transformed
 * value (`given`), not the children themselves (#3961). The passthrough twin, which
 * holds the children unchanged, is in `children-read-into-state-delivered`.
 */
export const fixture = createFixture({
  id: 'children-read-into-state-shadow-transform',
  description: 'A same-named signal or memo that transforms dynamic JSX children holds the transformed value',
  source: `
'use client'
import { SignalTail, MemoTail } from './note'
export function Host(props: { label: string }) {
  return (
    <div>
      <SignalTail>{props.label}</SignalTail>
      <MemoTail>{props.label}</MemoTail>
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function SignalTail(props: { children?: unknown }) {
  const [children] = createSignal(props.children ? 'given' : 'none')
  return <b>{children() === 'given' ? 'transformed' : 'raw'}</b>
}
export function MemoTail(props: { children?: unknown }) {
  const children = createMemo(() => (props.children ? 'given' : 'none'))
  return <i>{children() === 'given' ? 'transformed' : 'raw'}</i>
}
`,
  },
  props: { label: 'hi' },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s1" bf="s1"><!--bf-cond-start:s0-->transformed<!--bf-cond-end:s0--></b>
      <i bf-s="test_s3" bf="s1"><!--bf-cond-start:s0-->transformed<!--bf-cond-end:s0--></i>
    </div>
  `,
})
