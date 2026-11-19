import { createFixture } from '../src/types'

/**
 * A memo reading an element of an array literal by a literal index
 * (`['y', 'z'][1]`, `[[1, 2], [3]][0].length`), here through array consts
 * (#3953). The Go constructor evaluates the memo with the runtime evaluator,
 * which does not read an element of an array by a computed literal key.
 */
export const fixture = createFixture({
  id: 'memo-over-array-const-index',
  description: 'A memo over an element of an array const, and over the length of a nested one (#3953)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function MemoOverArrayConstIndex() {
  const local = ['y', 'z']
  const grid = [[1, 2], [3]]
  const second = createMemo(() => local[1])
  const inner = createMemo(() => grid[0].length)
  return <p>{second()}|{inner()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->z<!--/-->|<!--bf:s1-->2<!--/--></p>
  `,
})
