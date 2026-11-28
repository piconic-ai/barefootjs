import { createFixture } from '../src/types'

/**
 * A block memo that redeclares a `var` without an initializer (#3981). The
 * bare `var value` assigns nothing, so `value` keeps `'ready'`. The guard
 * reads the hoisted `var flag` (`undefined`), not the module `flag`, so it
 * is taken. The DSL adapters seed the memo from the static evaluator; Go
 * renders the slot empty (`block-memo-static-value-unseeded`).
 */
export const fixture = createFixture({
  id: 'memo-block-var-redeclare',
  description: 'A block memo keeps a var value past a bare redeclaration of it (#3981)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const flag = true
export function MemoBlockVarRedeclare() {
  const m = createMemo(() => {
    var value = 'ready'
    if (flag === undefined) { var value }
    if (false) { var flag = false }
    return value ?? 'fallback'
  })
  return <p>{m()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->ready<!--/--></p>
  `,
})
