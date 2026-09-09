import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-nested-loop-conditional` (#2897 fix,
 * #2893 Go template refusal).
 *
 * The marker defers the whole outer loop to client evaluation, so SSR
 * renders the empty `<ul>` on EVERY adapter and no BF101 may fire — same
 * suppression contract as `static-nested-loop-ref-client.ts`. Verifies the
 * Go template adapter's BF101 refusal (pinned in `conformance-pins.ts` for
 * the non-@client fixture, #2893) has a working escape, as its own
 * diagnostic suggestion claims.
 *
 * `rows` is an EMPTY literal array (unlike the non-@client twin's populated
 * one) — CSR conformance compares `expectedHtml` against the POST-HYDRATION
 * DOM, not raw SSR output, and `/* @client *​/` genuinely renders the loop
 * client-side once hydrated. A populated array would hydrate to real
 * `<li>`/`<span>` content, diverging from the empty SSR markup this fixture
 * pins. Empty keeps SSR and post-hydration state identical, matching
 * `static-nested-loop-ref-client.ts`'s same empty-signal precedent.
 */
export const fixture = createFixture({
  id: 'static-nested-loop-conditional-client',
  description: 'static outer array + nested inner .map() conditional + /* @client */ suppresses the Go template BF101 refusal (#2893)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Child = { id: number }
type Row = { id: number; children: Child[] }
export function StaticNestedLoopConditionalClient() {
  const rows: Row[] = []
  const [flag] = createSignal(true)
  return (
    <ul>
      {/* @client */ rows.map(row => (
        <li key={row.id}>
          {row.children.map(child => (
            <span key={child.id}>
              {flag() ? <b>on</b> : <i>off</i>}
            </span>
          ))}
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
