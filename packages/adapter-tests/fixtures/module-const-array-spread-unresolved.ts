import { createFixture } from '../src/types'

/**
 * #3979: a module-level array const spreading a value no compile-time
 * evaluator computes (`[...new Set(['y', 'y']), 'z']`). Phase 1 expands only
 * a spread of a literal array const or an inline array literal, so a memo
 * reading this const has no server value on the template adapters.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-unresolved',
  description: 'A memo over a module-level array const spreading a Set renders its length (#3979)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const ALL = [...new Set(['y', 'y']), 'z']
export function ModuleConstArraySpreadUnresolved() {
  const n = createMemo(() => ALL.length)
  return <p>{n()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
