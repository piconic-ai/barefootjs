import { createFixture } from '../src/types'

/**
 * `%` over a `NaN` operand. JS `%` is the floating-point remainder, so
 * `NaN % 2` is `NaN`. The `NaN` comes from a signal created with no initial
 * value: its SSR value is `undefined`, which arithmetic reads as `NaN`
 * (an omitted optional number prop gives the same operand). An engine whose
 * remainder is an integer operation truncates the `NaN` instead.
 */
export const fixture = createFixture({
  id: 'remainder-nan-operand',
  description: 'Remainder over a NaN operand (NaN % 2 → NaN)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNanOperand() {
  const [n] = createSignal<number>()
  return (
    <p data-n={n() % 2}>
      <span>{n() % 3}</span>
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2" data-n="NaN"><span bf="s1"><!--bf:s0-->NaN<!--/--></span></p>
  `,
})
