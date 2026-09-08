import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-nested-loop-ref` (#2798 fix, #2893 Go
 * template refusal).
 *
 * The marker defers the whole outer loop to client evaluation, so SSR
 * renders the empty `<ul>` on EVERY adapter and no BF101 may fire — same
 * suppression contract as `filter-nested-callback-predicate-client.ts`.
 * Verifies the Go template adapter's BF101 refusal (pinned in
 * `conformance-pins.ts` for the non-@client fixture, #2893) has a working
 * escape, as its own diagnostic suggestion claims.
 *
 * `items` is an EMPTY literal array (unlike the non-@client twin's
 * populated one) — CSR conformance compares `expectedHtml` against the
 * POST-HYDRATION DOM, not raw SSR output, and `/* @client *​/` genuinely
 * renders the loop client-side once hydrated. A populated array would
 * hydrate to real `<li>`/`<span>` content, diverging from the empty SSR
 * markup this fixture pins. Empty keeps SSR and post-hydration state
 * identical, matching `filter-nested-callback-predicate-client.ts`'s
 * same empty-signal precedent.
 */
export const fixture = createFixture({
  id: 'static-nested-loop-ref-client',
  description: 'static outer array + nested inner .map() + /* @client */ suppresses the Go template BF101 refusal (#2893)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; children: { id: number }[] }
export function StaticNestedLoopRefClient() {
  const items: Item[] = []
  const [count] = createSignal(0)
  const trackMount = (el: Element) => { el.setAttribute('data-tracked', '1') }
  return (
    <ul>
      {/* @client */ items.map(item => (
        <li key={item.id}>
          {item.children.map(child => (
            <span key={child.id} ref={trackMount}>{child.id}:{count()}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s4"></ul>
  `,
})
