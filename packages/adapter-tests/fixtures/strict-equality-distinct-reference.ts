import { createFixture } from '../src/types'

/**
 * `===` / `!==` between two distinct objects or arrays with the same
 * contents compares reference identity, so they are not equal. The operands
 * are two props and two elements of one array literal, each a separate
 * structure in the fixture data, so they are distinct on every backend. (A
 * same-element read such as `rows().at(0) === rows().at(0)` is left out: the
 * SSR reference re-evaluates a signal's literal initial value on each read,
 * so its answer there is not the client's.)
 */
export const fixture = createFixture({
  id: 'strict-equality-distinct-reference',
  description: '=== / !== between distinct objects or arrays with equal contents is false / true',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function StrictEqualityDistinctReference({ obj, other, arr, otherArr }: { obj: { id: number }; other: { id: number }; arr: number[]; otherArr: number[] }) {
  const [rows] = createSignal([{ id: 1 }, { id: 1 }])
  return (
    <div data-same={String(obj === other)}>
      <p>{obj === other ? 'same' : 'different'}</p>
      <p>{arr !== otherArr ? 'ne' : 'eq'}</p>
      <p>{rows().at(0) === rows().at(1) ? 'same' : 'different'}</p>
      <p>{obj !== other && 'distinct'}</p>
    </div>
  )
}
`,
  props: { obj: { id: 1 }, other: { id: 1 }, arr: [1], otherArr: [1] },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-same="false">
      <p bf="s1"><!--bf-cond-start:s0-->different<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->ne<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->different<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->distinct<!--bf-cond-end:s6--></p>
    </div>
  `,
})
