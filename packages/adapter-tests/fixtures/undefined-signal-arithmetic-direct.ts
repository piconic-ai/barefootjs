import { createFixture } from '../src/types'

/**
 * Sibling of `undefined-signal-arithmetic-memo` (#3390): arithmetic over a
 * zero-arg `createSignal()` read directly in an attribute and in text, with
 * no memo between. The signal's SSR value is `undefined`, and
 * `ToNumber(undefined)` is `NaN`, so both render `NaN`.
 */
export const fixture = createFixture({
  id: 'undefined-signal-arithmetic-direct',
  description: 'Arithmetic over a zero-arg signal read directly renders NaN in an attribute and in text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UndefinedSignalArithmeticDirect() {
  const [t] = createSignal<number>()
  return (
    <p data-m={t() * 2}>
      <span>{t() - 1}</span>
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2" data-m="NaN"><span bf="s1"><!--bf:s0-->NaN<!--/--></span></p>
  `,
})
