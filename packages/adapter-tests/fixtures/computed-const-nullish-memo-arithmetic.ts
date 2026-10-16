import { createFixture } from '../src/types'

/**
 * A computed const with a `??` default over an optional numeric prop, next to
 * a memo that does arithmetic on the same prop.
 *
 * Go reads the `??` in the const as a nullish consumption of `n`, so the
 * input field becomes `interface{}`; the memo's constructor value then has
 * to compute through the boxed runtime helper (`bf.Mul(in.N, 2)`), since Go
 * has no `interface{} * int` (#3494 review). The memo is read only when `n`
 * is supplied: `undefined * 2` is `NaN` in JS, which the template backends
 * do not render, and that is not what this fixture pins.
 */
export const fixture = createFixture({
  id: 'computed-const-nullish-memo-arithmetic',
  description: 'a nullish computed const and memo arithmetic over the same optional prop compile and render (#3494)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function NullishMemoArithmetic(props: { n?: number }) {
  const shown = props.n ?? 1
  const doubled = createMemo(() => props.n! * 2)
  return <p data-shown={shown}>{props.n !== undefined ? doubled() : 'none'}</p>
}
`,
  props: { n: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s2" data-shown="3"><!--bf-cond-start:s0--><!--bf:s1-->6<!--/--><!--bf-cond-end:s0--></p>
  `,
})
