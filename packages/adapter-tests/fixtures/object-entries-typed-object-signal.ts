import { createFixture } from '../src/types'

/**
 * `Object.entries` over a signal holding an object whose type is a named
 * object type (`type O = { a: string; b: string }`) lists its own members
 * in insertion order.
 */
export const fixture = createFixture({
  id: 'object-entries-typed-object-signal',
  description: 'Object.entries over a signal typed with a named object type lists its members',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type O = { a: string; b: string }
export function ObjectEntriesTypedObjectSignal() {
  const [o] = createSignal<O>({ a: 'x', b: 'y' })
  return <p>{Object.entries(o()).map(([k, v]) => <i key={k}>{k}={v}</i>)}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2">
      <i data-key="a"><!--bf:s0-->a<!--/-->=<!--bf:s1-->x<!--/--></i>
      <i data-key="b"><!--bf:s0-->b<!--/-->=<!--bf:s1-->y<!--/--></i>
    </p>
  `,
})
