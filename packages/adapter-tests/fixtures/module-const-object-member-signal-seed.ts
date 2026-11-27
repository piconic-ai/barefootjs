import { createFixture } from '../src/types'

/**
 * The object sibling of `module-const-array-member-signal-seed`: a signal
 * seeded from a member of a module-level object literal const
 * (`createSignal(CFG.n)`). The seed has a compile-time value, `2`.
 */
export const fixture = createFixture({
  id: 'module-const-object-member-signal-seed',
  description: 'a signal seeded from a member of a module-level object literal const renders the seed',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const CFG = { n: 2, s: 'v' }
export function ModuleConstObjectMemberSignalSeed() {
  const [n] = createSignal(CFG.n)
  const [s] = createSignal(CFG.s)
  return <p>{n()}|{s()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->v<!--/--></p>
  `,
})
