import { createFixture } from '../src/types'

/**
 * A signal getter and a memo named like module consts (#3739). The module
 * consts that read those names (`const start = count + 1`,
 * `const label = total + '!'`) keep the module values; the component reads
 * its own signal and memo.
 */
export const fixture = createFixture({
  id: 'module-const-shadowed-by-signal',
  description: 'A signal and a memo hide module consts of the same name inside the component only',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

const count = 100
const start = count + 1
const total = 'sum'
const label = total + '!'

export function ModuleConstShadowedBySignal() {
  const [count, setCount] = createSignal(1)
  const total = createMemo(() => count() * 2)
  return <button onClick={() => setCount(count() + 1)}>{count()}/{start}/{total()}/{label}</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s4"><!--bf:s0-->1<!--/-->/<!--bf:s1-->101<!--/-->/<!--bf:s2-->2<!--/-->/<!--bf:s3-->sum!<!--/--></button>
  `,
})
