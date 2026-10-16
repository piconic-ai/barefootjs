import { createFixture } from '../src/types'

/**
 * A computed const with a `??` default over an optional numeric prop, next to
 * memos that do arithmetic on the same prop: directly, through a typed alias
 * memo over a computed const, and one level down from an untyped alias memo.
 *
 * Go reads the `??` in the const as a nullish consumption of `n`, so the
 * input field becomes `interface{}`; each memo's constructor value then has
 * to compute through the boxed runtime helper (`bf.Mul(in.N, 2)`), since Go
 * has no `interface{} * int`, and each memo field has to be `interface{}` to
 * hold it (#3494 review). The memos are read only when `n` is supplied:
 * `undefined * 2` is `NaN` in JS, which the template backends do not render,
 * and that is not what this fixture pins.
 */
export const fixture = createFixture({
  id: 'computed-const-nullish-memo-arithmetic',
  description: 'a nullish computed const and memo arithmetic over the same optional prop compile and render (#3494)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function NullishMemoArithmetic(props: { n?: number }) {
  const shown = props.n ?? 1
  const twice = props.n! * 2
  const doubled = createMemo(() => props.n! * 2)
  const typedAlias = createMemo<number>(() => twice)
  const alias = createMemo(() => twice)
  const quadrupled = createMemo(() => alias() * 2)
  return (
    <div data-shown={shown}>
      <p>{props.n !== undefined ? doubled() : 'none'}</p>
      <p>{props.n !== undefined ? typedAlias() : 'none'}</p>
      <p>{props.n !== undefined ? quadrupled() : 'none'}</p>
    </div>
  )
}
`,
  props: { n: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-shown="3">
      <p bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->6<!--/--><!--bf-cond-end:s0--></p>
      <p bf="s5"><!--bf-cond-start:s3--><!--bf:s4-->6<!--/--><!--bf-cond-end:s3--></p>
      <p bf="s8"><!--bf-cond-start:s6--><!--bf:s7-->12<!--/--><!--bf-cond-end:s6--></p>
    </div>
  `,
})
