import { createFixture } from '../src/types'

/**
 * The client-directive escape of memo-object-body-computed-key-module-const.
 */
export const fixture = createFixture({
  id: 'memo-object-body-computed-key-module-const-client',
  description: 'The client-directive escape of memo-object-body-computed-key-module-const',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 'v' }
export function MemoObjectBodyComputedKeyModuleConstClient() {
  const m = createMemo(() => ({ ['k']: o.k }))
  return <p>{/* @client */ m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
