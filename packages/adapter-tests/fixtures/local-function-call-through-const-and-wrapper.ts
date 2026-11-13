import { createFixture } from '../src/types'

/**
 * Calls of a local function a template inlines, reached indirectly: through
 * a const initializer, through an arrow wrapper, from a memo and from a memo
 * of that memo. A function reading a prop seeds a signal with the prop's
 * value. Each server value is what the calls return, as in JS.
 */
export const fixture = createFixture({
  id: 'local-function-call-through-const-and-wrapper',
  description: 'A signal seed and memos reading an inlinable local function through a const initializer and a wrapper render the returned values',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function LocalFunctionCallThroughConstAndWrapper(props: { value?: number }) {
  function value() { return 1 }
  const wrap = () => value() + 1
  const initial = value()
  const [n] = createSignal(initial)
  const [w] = createSignal(wrap())
  const m = createMemo(() => wrap() + n())
  function fromProp() { return props.value ?? 3 }
  const [p] = createSignal(fromProp())
  const mm = createMemo(() => m() * 2)
  return <p>{n()}:{w()}:{m()}:{mm()}:{initial}:{p()}:{fromProp()}</p>
}
`,
  props: { value: 9 },
  dataPoints: [
    { name: 'props-absent', props: {} },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s7"><!--bf:s0-->1<!--/-->:<!--bf:s1-->2<!--/-->:<!--bf:s2-->3<!--/-->:<!--bf:s3-->6<!--/-->:<!--bf:s4-->1<!--/-->:<!--bf:s5-->9<!--/-->:<!--bf:s6-->9<!--/--></p>
  `,
})
