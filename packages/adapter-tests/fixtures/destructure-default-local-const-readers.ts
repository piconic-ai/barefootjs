import { createFixture } from '../src/types'

/**
 * A body destructure default that reads a component-local const (#3725),
 * read through what reads the prop: a memo, a memo of that memo, a
 * condition (`on = DEF === 'z'`), a child prop and a loop row. The signal
 * seed is `destructure-default-local-const-signal-seed`.
 */
export const fixture = createFixture({
  id: 'destructure-default-local-const-readers',
  description: 'A default reading a component-local const reaches a memo, a condition, a child prop and a loop row',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Kid(props: { v?: string }) {
  return <i>{props.v}</i>
}

export function DestructureDefaultLocalConstReaders(props: { rows: string[]; b?: string; n?: number; on?: boolean }) {
  const DEF = 'z'
  const STEP = 2
  const { b = DEF.toUpperCase(), n = STEP + 1, on = DEF === 'z' } = props
  const m = createMemo(() => b + '!')
  const total = createMemo(() => n * 2)
  const twice = createMemo(() => total() + n)
  return (
    <div>
      <p>{m()}|{total()}|{twice()}</p>
      {on ? <b>{b}</b> : <i>off</i>}
      <Kid v={b} />
      <ul>{props.rows.map(r => <li key={r}>{r}-{b}</li>)}</ul>
    </div>
  )
}
`,
  props: { rows: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s12">
      <p bf="s3"><!--bf:s0-->Z!<!--/-->|<!--bf:s1-->6<!--/-->|<!--bf:s2-->9<!--/--></p>
      <b bf-c="s4" bf="s6"><!--bf:s5-->Z<!--/--></b>
      <i bf-s="test_s7" bf="s1"><!--bf:s0-->Z<!--/--></i>
      <ul bf="s11">
        <li bf="s10" data-key="r1"><!--bf:s8-->r1<!--/-->-<!--bf:s9-->Z<!--/--></li>
        <li bf="s10" data-key="r2"><!--bf:s8-->r2<!--/-->-<!--bf:s9-->Z<!--/--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'all-passed', props: { rows: ['q'], b: 'B', n: 7, on: false } },
  ],
})
