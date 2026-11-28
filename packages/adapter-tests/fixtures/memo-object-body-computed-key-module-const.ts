import { createFixture } from '../src/types'

/**
 * A memo returning an object literal with a computed key that reads a module
 * const member: `createMemo(() => ({ ['k']: o.k }))`. The parser has no tree
 * for a computed key, so Go's constructor cannot build the object and refuses
 * the memo (BF101); `/* @client *\/` defers the read
 * (`memo-object-body-computed-key-module-const-client`). The DSL adapters
 * read the static seed, which computes the key.
 */
export const fixture = createFixture({
  id: 'memo-object-body-computed-key-module-const',
  description: 'A memo returning an object literal with a computed key reading a module const member renders it',
  escapes: [{ kind: 'client-directive', fixture: 'memo-object-body-computed-key-module-const-client' }],
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
const o = { k: 'v' }
export function MemoObjectBodyComputedKeyModuleConst() {
  const m = createMemo(() => ({ ['k']: o.k }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->v<!--/--></p>
  `,
})
