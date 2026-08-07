import { createFixture } from '../src/types'

/**
 * Controlled `<select value={signal()}>` — SSR expresses the initial
 * selection as `selected` on the matching `<option>`, never as a `value`
 * attribute on the `<select>` (invalid HTML that browsers ignore).
 *
 * FIXED (#2464): the shared-IR lowering marks the `value` attr
 * `clientOnly` (the hydrate-time `.value` binding is unchanged) and
 * distributes `selected={(value) === 'opt'}` onto each statically-valued
 * option — the per-option shape `select-option-selected` proves across
 * every adapter. Options rendered by a `.map()` loop get the same
 * treatment against the option's own value EXPRESSION (e.g.
 * `selected={(value) === o.id}`), which rides the loop's existing per-row
 * reactive-attribute machinery so `selected` is recomputed on both item
 * change and outer-signal change — fixing the reorder-drops-selection bug
 * (#2466; see the `select-loop-selected` fixture / conformance coverage).
 * This fixture is the regression armor; `progress-meter-value` guards the
 * other direction (elements where `value` IS the legitimate attribute).
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
      <option selected value="banana">Banana</option>
      <option value="cherry">Cherry</option>
    </select>
  `,
})
