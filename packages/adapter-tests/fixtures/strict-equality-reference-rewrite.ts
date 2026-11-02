import { createFixture } from '../src/types'

/**
 * The rewrite of `strict-equality-distinct-reference` and
 * `strict-equality-same-reference`, which every template adapter refuses
 * with BF101 (#3774, #3824 step 8): a template engine holds a decoded prop
 * as a value, so it cannot compare objects or arrays by reference. Comparing
 * a primitive field (an id, a length) is a strict equality over primitives,
 * which every adapter lowers.
 */
export const fixture = createFixture({
  id: 'strict-equality-reference-rewrite',
  description: '=== / !== over a primitive field of two objects or arrays instead of the objects themselves',
  source: `
export function StrictEqualityReferenceRewrite({ obj, other, arr, otherArr }: { obj: { id: number }; other: { id: number }; arr: number[]; otherArr: number[] }) {
  return (
    <div data-same={String(obj.id === other.id)}>
      <p>{(obj.id === other.id) ? 'same id' : 'different id'}</p>
      <p>{(arr.length !== otherArr.length) ? 'ne' : 'eq'}</p>
      <p>{(obj.id !== other.id) && 'distinct'}</p>
    </div>
  )
}
`,
  props: { obj: { id: 1 }, other: { id: 1 }, arr: [1], otherArr: [1, 2] },
  expectedHtml: `
    <div bf-s="test" bf="s6" data-same="true">
      <p bf="s1"><!--bf-cond-start:s0-->same id<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->ne<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4--><!--bf-cond-end:s4--></p>
    </div>
  `,
})
