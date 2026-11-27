import { createFixture } from '../src/types'

/**
 * Block memos whose `if` branch declares a local named like a module const
 * (#3981). The branch's `const label` ends with the branch, so `return label`
 * reads the module `label` (`fallback`), whether the local's initializer is
 * one the static evaluator cannot compute (`JSON.stringify('branch')`) or one
 * it can (`'x'`, which it used to leak, rendering `x`). The DSL adapters
 * seed each memo from the static evaluator; Go renders the slots empty
 * (`block-memo-static-value-unseeded`).
 */
export const fixture = createFixture({
  id: 'memo-block-branch-local-scope',
  description: 'A block memo reads a module const past a branch-local of the same name (#3981)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const label = 'fallback'
export function MemoBlockBranchLocalScope() {
  const unresolved = createMemo(() => {
    if (true) {
      const label = JSON.stringify('branch')
    }
    return label
  })
  const resolved = createMemo(() => {
    if (true) {
      const label = 'x'
    }
    return label
  })
  return <p>{unresolved()} {resolved()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->fallback<!--/--><!--bf:s1-->fallback<!--/--></p>
  `,
})
