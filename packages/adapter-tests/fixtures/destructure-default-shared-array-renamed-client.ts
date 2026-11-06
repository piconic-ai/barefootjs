import { createFixture } from '../src/types'

/**
 * `destructure-default-shared-array-renamed` deferred to the client via `/* @client *\/`, the escape its BF101
 * suggests: the server renders an empty slot, and the client's init runs the
 * push over the shared array and renders `1`. A corpus fixture, not a shared
 * spec: the real-browser `snap` / `three-point` oracles assert that
 * hydration changes nothing, which a `/* @client *\/` fill does by design.
 */
export const fixture = createFixture({
  id: 'destructure-default-shared-array-renamed-client',
  description: 'A destructure default reading an earlier binding kept as a local, deferred to the client via /* @client */ (shared-array-renamed)',
  source: `
'use client'
export function DestructureDefaultSharedArrayRenamedClient(props: { a?: string[]; b?: string[] }) {
  let { a: x = [], b = x } = props
  const n = x.push('x') && b.length
  return <p data-slot="count">{/* @client */ n}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1" data-slot="count"><!--bf:s0--><!--/--></p>
  `,
})
