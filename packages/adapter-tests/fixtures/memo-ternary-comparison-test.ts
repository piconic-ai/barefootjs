import { createFixture } from '../src/types'

/**
 * A memo whose declared type is unknown (props typed `any`) and whose body is
 * a ternary with a comparison in its TEST and numbers in its branches. Go used
 * to type it `bool` because a regex found `===` anywhere in the computation,
 * so it rendered `false` instead of the number (#3512). Whether a memo is a
 * boolean is now read from the parsed body, where only the branches decide.
 * The aliased destructure of the same prop (`{ sel: chosen }`) must not give
 * the evaluator's props map a duplicate `sel` key, which Go rejects.
 */
export const fixture = createFixture({
  id: 'memo-ternary-comparison-test',
  description: 'An untyped ternary memo with a comparison test and numeric branches renders the number',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function TernaryTestMemo(props: { items: any; sel: any }) {
  const { sel: chosen = 'none' } = props
  const [n, setN] = createSignal(0)
  const label = createMemo(() => props.sel === 'b' ? props.items.length : n())
  return <button onClick={() => setN(n() + 1)}>{label()}|{chosen}</button>
}
`,
  props: { items: ['a', 'b'], sel: 'b' },
  expectedHtml: `
    <button bf-s="test" bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->b<!--/--></button>
  `,
  dataPoints: [
    { name: 'other-selection', props: { items: ['a', 'b'], sel: 'a' } },
  ],
})
