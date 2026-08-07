import { createFixture } from '../src/types'

/**
 * `<select value={signal()}>` whose `<option>`s come from a `.map()` loop
 * with a dynamic per-row `value` (e.g. `value={o.id}`) — the loop half of
 * #2464's controlled-select SSR projection, and the shape #2466's compiler
 * fix wires reactively.
 *
 * `lowerFormControlValueSsr` (`jsx-to-ir.ts`) distributes `selected` onto
 * the loop's `<option>` element compared against its own value EXPRESSION
 * (`selected={(value) === o.id}`), not a `JSON.stringify`'d literal — the
 * option's value differs per row. That makes `selected` an ordinary
 * per-row reactive attribute, so both SSR (this fixture) and the client
 * loop plan's `applyItem` / `applyOuter` (pinned by the compiler unit test
 * `index-keyed .map() loop option: selected rides applyItem AND
 * applyOuter (#2466)` in `packages/jsx/src/__tests__/form-control-value-ssr.test.ts`)
 * recompute it — fixing the bug where an INDEX-KEYED reorder left
 * `selected` attached to whichever physical `<option>` happened to have
 * its `value` rewritten in place, instead of following the controlled
 * signal's value.
 */
export const fixture = createFixture({
  id: 'select-loop-selected',
  description: 'Controlled select distributes selected onto .map()-rendered options (#2466)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function FruitPicker() {
  const [fruits] = createSignal([{ id: 'apple', label: 'Apple' }, { id: 'banana', label: 'Banana' }])
  const [picked, setPicked] = createSignal('banana')
  return (
    <select value={picked()} onChange={(e) => setPicked(e.target.value)}>
      {fruits().map((f, i) => <option key={i} value={f.id}>{f.label}</option>)}
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s2">
      <option bf="s1" data-key="0" value="apple"><!--bf:s0-->Apple<!--/--></option>
      <option bf="s1" data-key="1" selected value="banana"><!--bf:s0-->Banana<!--/--></option>
    </select>
  `,
})
