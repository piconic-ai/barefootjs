import { createFixture } from '../src/types'

/**
 * A component loop row over a number array keyed by `n.toString()`, passing
 * the same `n.toString()` as the child's prop. Each row renders `data-key`
 * and its text as JS stringifies the number (`1`, `2.5`). The string-array,
 * index and element-row shapes are `loop-key-to-string` (#3621).
 */
export const fixture = createFixture({
  id: 'loop-key-to-string-number-component-row',
  description: 'A component loop row over a number array keyed by n.toString() renders data-key',
  source: `
'use client'

function Num(props: { label: string }) {
  return <li className="num">{props.label}</li>
}

export function LoopKeyToStringNumberComponentRow(props: { values: number[] }) {
  return <ul>{props.values.map(n => <Num key={n.toString()} label={n.toString()} />)}</ul>
}
`,
  props: { values: [1, 2.5] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="Num_*" bf="s1" class="num" data-key="1"><!--bf:s0-->1<!--/--></li>
      <li bf-s="Num_*" bf="s1" class="num" data-key="2.5"><!--bf:s0-->2.5<!--/--></li>
    </ul>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'loop-key-to-string-number-component-row-client' }],
})
