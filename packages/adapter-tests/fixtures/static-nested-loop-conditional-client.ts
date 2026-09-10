import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-nested-loop-conditional` (#2897 fix).
 *
 * The marker defers the whole outer loop to client evaluation, so SSR
 * renders the empty `<ul>` on EVERY adapter — same suppression contract as
 * `static-nested-loop-ref-client.ts`. Originally authored to verify the Go
 * template adapter's BF101 refusal (then pinned to #2893) had a working
 * escape; #2893 fixed the nested-loop structural bail so the NON-@client
 * base fixture now compiles clean on Go too (no refusal left to escape) —
 * kept as its own coverage of the `/* @client *​/` suppression contract on
 * this nested-loop-plus-conditional shape.
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
