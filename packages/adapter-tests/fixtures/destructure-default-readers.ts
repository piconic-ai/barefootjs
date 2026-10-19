import { createFixture } from '../src/types'

/**
 * A prop whose destructure default reads an earlier prop
 * (`{ off = false, on = off }`), read by everything that takes a prop: a
 * signal seed, a memo, a condition, a loop row and a child's prop. Each one
 * reads the prop with its default applied, so an omitted `on` takes `off`'s
 * value everywhere, and an explicit `on: false` stays `false`.
 */
export const fixture = createFixture({
  id: 'destructure-default-readers',
  description: 'Every reader of a prop whose destructure default reads an earlier prop sees the resolved value',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Mark } from './mark'
export function DestructureDefaultReaders({ off = false, on = off, rows }: { off?: boolean; on?: boolean; rows: string[] }) {
  const [v, setV] = createSignal(on)
  const flipped = createMemo(() => !on)
  return (
    <div>
      <p onClick={() => setV(!v())}>{String(on)}|{String(v())}|{String(flipped())}</p>
      {on ? <b>y</b> : <i>n</i>}
      <ul>{rows.map(r => <li key={r}>{r}:{String(on)}</li>)}</ul>
      <Mark value={on} />
    </div>
  )
}
`,
  components: {
    './mark.tsx': `
export function Mark({ value }: { value?: boolean }) {
  return <span>{String(value)}</span>
}
`,
  },
  props: { off: true, rows: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s10">
      <p bf="s3"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/-->|<!--bf:s2-->false<!--/--></p>
      <b bf-c="s4">y</b>
      <ul bf="s8">
        <li bf="s7" data-key="a"><!--bf:s5-->a<!--/-->:<!--bf:s6-->true<!--/--></li>
        <li bf="s7" data-key="b"><!--bf:s5-->b<!--/-->:<!--bf:s6-->true<!--/--></li>
      </ul>
      <span bf-s="test_s9" bf="s1"><!--bf:s0-->true<!--/--></span>
    </div>
  `,
  dataPoints: [
    { name: 'absent', props: { rows: ['a', 'b'] } },
    { name: 'on-false', props: { on: false, rows: ['a', 'b'] } },
    { name: 'off-true-on-false', props: { off: true, on: false, rows: ['a', 'b'] } },
  ],
})
