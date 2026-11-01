import { createFixture } from '../src/types'

/**
 * Escape twin of `strict-equality-distinct-reference` and
 * `strict-equality-same-reference`, which every template adapter refuses
 * with BF101 (#3774, #3824 step 8): the same object and array comparisons,
 * marked `/* @client *\/`, so they are evaluated in the browser instead of
 * refusing SSR.
 */
export const fixture = createFixture({
  id: 'strict-equality-reference-client',
  description: 'a /* @client */ === / !== between objects or arrays defers to the browser',
  source: `
'use client'
export function StrictEqualityReferenceClient({ obj, other, arr }: { obj: { id: number }; other: { id: number }; arr: number[] }) {
  return (
    <div>
      <p>{/* @client */ (obj === other) ? 'same' : 'different'}</p>
      <p>{/* @client */ (arr !== arr) ? 'ne' : 'eq'}</p>
    </div>
  )
}
`,
  props: { obj: { id: 1 }, other: { id: 1 }, arr: [1] },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2--><!--bf-cond-end:s2--></p>
    </div>
  `,
})
