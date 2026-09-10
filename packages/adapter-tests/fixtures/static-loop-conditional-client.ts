import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-loop-conditional` (#2897 fix).
 *
 * The marker defers the whole loop to client evaluation, so SSR renders the
 * empty `<ul>` on EVERY adapter — same suppression contract as
 * `filter-nested-callback-predicate-client.ts` / `static-nested-loop-ref-
 * client.ts`. Originally authored to verify the Go template adapter's BF101
 * refusal (#2898) had a working escape; #2898 later fixed the base fixture
 * directly, so this twin is no longer required by the escape-coverage floor
 * test — kept as its own standalone `/* @client *​/` suppression coverage.
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
