import { createFixture } from '../src/types'

/**
 * A (props)-arg component declares an ordinary const named like a typed
 * prop the body never destructures, after the memo that reads it: the memo
 * reads the const, so a supplied colliding prop (`{ value: 9 }`) still
 * renders its `1`.
 */
export const fixture = createFixture({
  id: 'memo-const-declared-after-named-like-prop',
  description: 'A memo reading a const declared after it and named like a typed prop reads the const, not the prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoConstDeclaredAfterNamedLikeProp(props: { value?: number }) {
  const n = createMemo(() => value)
  const value = 1
  return <p>{n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'value-absent', props: {} },
  ],
})
