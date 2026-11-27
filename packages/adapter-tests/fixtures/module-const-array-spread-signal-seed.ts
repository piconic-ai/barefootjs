import { createFixture } from '../src/types'

/**
 * #3979: a signal seeded from a read of a module-level array const that
 * spreads another literal array const (`createSignal(ALL.length)`).
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-signal-seed',
  description: 'A signal seeded from a module-level array const built with a spread renders the seed (#3979)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const BASE = ['y']
const ALL = [...BASE, 'z']
export function ModuleConstArraySpreadSignalSeed() {
  const [n] = createSignal(ALL.length)
  return <p>{n()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
})
