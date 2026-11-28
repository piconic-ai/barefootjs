import { createFixture } from '../src/types'

/**
 * A memo returning an object literal that reads another memo: `createMemo(() => ({ k: n() }))`.
 */
export const fixture = createFixture({
  id: 'memo-object-body-reads-memo',
  description: 'A memo returning an object literal that reads another memo renders its value',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoObjectBodyReadsMemo() {
  const [c] = createSignal(2)
  const n = createMemo(() => c() * 3)
  const m = createMemo(() => ({ k: n() }))
  return <p>{m().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->6<!--/--></p>
  `,
})
