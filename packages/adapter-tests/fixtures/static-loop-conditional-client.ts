import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-loop-conditional` (#2897 fix, #2898 Go
 * template refusal).
 *
 * The marker defers the whole loop to client evaluation, so SSR renders the
 * empty `<ul>` on EVERY adapter and no BF101 may fire — same suppression
 * contract as `filter-nested-callback-predicate-client.ts` /
 * `static-nested-loop-ref-client.ts`. Verifies the Go template adapter's
 * BF101 refusal (pinned in `conformance-pins.ts` for the non-@client
 * fixture, #2898) has a working escape, as its own diagnostic suggestion
 * claims.
 *
 * `items` is an EMPTY literal array (unlike the non-@client twin's
 * populated one) — CSR conformance compares `expectedHtml` against the
 * POST-HYDRATION DOM, not raw SSR output, and `/* @client *​/` genuinely
 * renders the loop client-side once hydrated. A populated array would
 * hydrate to real `<li>` content, diverging from the empty SSR markup this
 * fixture pins. Empty keeps SSR and post-hydration state identical.
 */
export const fixture = createFixture({
  id: 'static-loop-conditional-client',
  description: 'static array + inline conditional + /* @client */ suppresses the Go template BF101 refusal (#2898)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; label: string }
export function StaticLoopConditionalClient() {
  const items: Item[] = []
  const [flag] = createSignal(true)
  return (
    <ul>
      {/* @client */ items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {flag() ? <b>on</b> : <i>off</i>}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3"></ul>
  `,
})
