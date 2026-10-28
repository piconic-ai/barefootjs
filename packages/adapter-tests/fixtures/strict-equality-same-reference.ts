import { createFixture } from '../src/types'

/**
 * `===` / `!==` between an object or array and itself: a value is equal to
 * its own reference.
 */
export const fixture = createFixture({
  id: 'strict-equality-same-reference',
  description: '=== / !== between an object or array and itself is true / false',
  source: `
export function StrictEqualitySameReference({ obj, arr }: { obj: { id: number }; arr: number[] }) {
  return (
    <div data-same={String(obj === obj)}>
      <p>{obj === obj ? 'same' : 'different'}</p>
      <p>{arr === arr ? 'same' : 'different'}</p>
      <p>{obj !== obj ? 'ne' : 'eq'}</p>
      <p>{arr !== arr ? 'ne' : 'eq'}</p>
    </div>
  )
}
`,
  props: { obj: { id: 1 }, arr: [1] },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-same="true">
      <p bf="s1"><!--bf-cond-start:s0-->same<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->same<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->eq<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->eq<!--bf-cond-end:s6--></p>
    </div>
  `,
})
