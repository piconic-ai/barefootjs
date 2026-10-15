import { createFixture } from '../src/types'

/**
 * `reduce-nonliteral-seed` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'reduce-nonliteral-seed-client',
  description: 'A `.reduce()` seeded with a non-literal value, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceNonliteralSeedClient() {
  const [items, setItems] = createSignal<number[]>([1, 2])
  const [start, setStart] = createSignal(10)
  return <p>{/* @client */ items().reduce((acc, x) => acc + x, start())}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
