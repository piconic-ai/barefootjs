import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-loop-item-boolean-attr` — the marker
 * defers the whole loop to client evaluation, so SSR renders the empty
 * `<ul>` on EVERY adapter and no BF101 may fire, same suppression contract
 * as `static-loop-item-conditional-client.ts`.
 *
 * `items` is an EMPTY literal array (unlike the non-@client twin's
 * populated one) — CSR conformance compares `expectedHtml` against the
 * POST-HYDRATION DOM, not raw SSR output, and an empty array keeps SSR and
 * post-hydration state identical.
 */
export const fixture = createFixture({
  id: 'static-loop-item-boolean-attr-client',
  description: 'static array + item-bound boolean attribute + /* @client */ suppresses the BF101 refusal (#2898, #2911)',
  source: `
type Item = { id: number; label: string; disabled: boolean }
export function StaticLoopItemBooleanAttrClient() {
  const items: Item[] = []
  return (
    <ul>
      {/* @client */ items.map(item => (
        <li key={item.id}>
          <button type="button" disabled={item.disabled}>{item.label}</button>
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2"></ul>
  `,
})
