import { createFixture } from '../src/types'

/**
 * A (props)-arg component's local function shares its name with a typed
 * prop the body never destructures: the memo calls the function, so a
 * supplied colliding prop (`{ value: 9 }`) still renders the function's `1`.
 */
export const fixture = createFixture({
  id: 'memo-local-function-named-like-prop',
  description: 'A memo calling a local function named like a typed prop calls the function, not the prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoLocalFunctionNamedLikeProp(props: { value?: number }) {
  function value() { return 1 }
  const n = createMemo(() => value())
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
