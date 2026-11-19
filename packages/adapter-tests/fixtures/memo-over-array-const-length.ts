import { createFixture } from '../src/types'

/**
 * A memo reading `.length` of a component-scope array const (#3953):
 * `const local = ['y', 'z']; createMemo(() => local.length)`. A template has
 * no binding for the component's consts, so the memo is applied as the
 * expression it stands for (`['y', 'z'].length`).
 */
export const fixture = createFixture({
  id: 'memo-over-array-const-length',
  description: 'A memo over the length of a component-scope array const renders the length (#3953)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function MemoOverArrayConstLength() {
  const local = ['y', 'z']
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
