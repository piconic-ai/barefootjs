import { createFixture } from '../src/types'

/**
 * #3979: a memo reads a module-level array const that spreads another
 * literal array const (`const ALL = [...BASE, 'z']`). Phase 1 expands the
 * spread of the literal const in place, so every adapter computes `2`.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-memo',
  description: 'A memo over a module-level array const built with a spread of a literal array const renders its length (#3979)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const BASE = ['y']
const ALL = [...BASE, 'z']
export function ModuleConstArraySpreadMemo() {
  const n = createMemo(() => ALL.length)
  return <p>{n()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
