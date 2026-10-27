import { createFixture } from '../src/types'

/**
 * A module-scope binding shares its name with a typed prop a (props)-arg
 * component's body never destructures: the memo reads the module binding,
 * so a supplied colliding prop (`{ value: 9 }`) still renders its `1`.
 */
export const fixture = createFixture({
  id: 'memo-module-binding-named-like-prop',
  description: 'A memo reading a module-scope binding named like a typed prop reads the binding, not the prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const value = 1
export function MemoModuleBindingNamedLikeProp(props: { value?: number }) {
  const n = createMemo(() => value)
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
