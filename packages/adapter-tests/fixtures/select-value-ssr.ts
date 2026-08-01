import { createFixture } from '../src/types'

/**
 * Controlled `<select value={signal()}>` — SSR must express the initial
 * selection as `selected` on the matching `<option>`, not as a `value`
 * attribute on the `<select>` (which is invalid HTML that browsers
 * ignore, so no-JS / pre-hydration users see the wrong option).
 *
 * Pins #2464. `expectedHtml` is hand-authored to the correct
 * React/Solid-parity output because the emission bug lives in the
 * shared compiler layer, so the Hono reference that normally generates
 * `expectedHtml` produces the wrong form (`<select value="banana">`,
 * no `selected` anywhere). Adapters still emitting that form skip this
 * fixture with a pointer to
 * https://github.com/piconic-ai/barefootjs/issues/2464; graduating
 * means fixing the emission, regenerating `expectedHtml` from the
 * fixed reference, and deleting the skip entries.
 */
export const fixture = createFixture({
  id: 'select-value-ssr',
  description: 'Controlled select SSRs `selected` on the matching option (#2464)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function FruitSelect() {
  const [fruit, setFruit] = createSignal('banana')
  return (
    <select value={fruit()} onChange={(e) => setFruit(e.target.value)}>
      <option value="apple">Apple</option>
      <option value="banana">Banana</option>
      <option value="cherry">Cherry</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s0">
      <option value="apple">Apple</option>
      <option value="banana" selected>Banana</option>
      <option value="cherry">Cherry</option>
    </select>
  `,
})
