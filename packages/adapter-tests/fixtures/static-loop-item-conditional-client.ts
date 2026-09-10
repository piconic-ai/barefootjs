import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-loop-item-conditional` — the marker
 * defers the whole loop to client evaluation, so SSR renders the empty
 * `<ul>` on EVERY adapter and no BF101 may fire (#2898's Go template gap,
 * #2911's Mojolicious/Xslate boolean-in-static-array gap alike) — same
 * suppression contract as `static-loop-conditional-client.ts`.
 *
 * `items` is an EMPTY literal array (unlike the non-@client twin's
 * populated one) — CSR conformance compares `expectedHtml` against the
 * POST-HYDRATION DOM, not raw SSR output, and `/* @client *​/` genuinely
 * renders the loop client-side once hydrated. A populated array would
 * hydrate to real `<li>` content, diverging from the empty SSR markup this
 * fixture pins. Empty keeps SSR and post-hydration state identical.
 */
export const fixture = createFixture({
  id: 'static-loop-item-conditional-client',
  description: 'static array + item-bound conditional + /* @client */ suppresses the BF101 refusal (#2898, #2911)',
  source: `
type Item = { id: number; label: string; active: boolean; tag: string | null }
export function StaticLoopItemConditionalClient() {
  const items: Item[] = []
  return (
    <ul>
      {/* @client */ items.map(item => (
        <li key={item.id}>
          <span>{item.label}</span>
          {item.active ? <b>on</b> : <i>off</i>}
          {item.tag ? <em>tagged</em> : null}
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
