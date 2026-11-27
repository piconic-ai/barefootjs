import { createFixture } from '../src/types'

/**
 * A signal seeded from a member of a module-level literal array const
 * (`createSignal(ALL.length)`). The seed has a compile-time value, `2`.
 */
export const fixture = createFixture({
  id: 'module-const-array-member-signal-seed',
  description: 'A signal seeded from the length of a module-level literal array const renders the seed',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const ALL = ['y', 'z']
export function ModuleConstArrayMemberSignalSeed() {
  const [n] = createSignal(ALL.length)
  return <p>{n()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
