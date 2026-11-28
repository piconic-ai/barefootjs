import { createFixture } from '../src/types'

/**
 * A signal seeded from an object literal that reads a module const member: `createSignal({ k: o.k })`.
 */
export const fixture = createFixture({
  id: 'signal-seed-object-reads-module-const-member',
  description: 'A signal seed object literal reading a module const member renders the member',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const o = { k: 1 }
export function SignalSeedObjectReadsModuleConstMember() {
  const [s] = createSignal({ k: o.k })
  return <p>{s().k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
