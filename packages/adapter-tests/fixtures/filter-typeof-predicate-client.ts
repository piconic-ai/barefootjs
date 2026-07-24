import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` twin of `filter-typeof-predicate`. Marking the chain
 * client-only suppresses the SSR diagnostic on every backend — the loop
 * renders empty at SSR and the browser (always JS) runs the `typeof` predicate.
 * No conformance pin: this must compile clean on all adapters, asserting the
 * `/* @client *\/` escape works. See `spec/callback-fidelity.md`.
 */
export const fixture = createFixture({
  id: 'filter-typeof-predicate-client',
  description: 'Off-subset filter predicate deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TypeofPredicateClient() {
  const [items, setItems] = createSignal<unknown[]>([])
  return <ul>{/* @client */ items().filter(t => typeof t === 'string').map((t, i) => <li key={i}>{String(t)}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
