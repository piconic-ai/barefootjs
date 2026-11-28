import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that spreads a module const:
 * `createMemo(() => ({ ...o, j: 2 }))`. The static seed evaluator had no value
 * for a spread, so the DSL adapters rendered both members empty.
 */
export const fixture = createFixture({
  id: 'memo-object-body-spreads-module-const',
  description: 'A memo returning an object literal that spreads a module const renders both members',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 1 }
export function MemoObjectBodySpreadsModuleConst() {
  const m = createMemo(() => ({ ...o, j: 2 }))
  return <p>{m().k}|{m().j}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->2<!--/--></p>
  `,
})
