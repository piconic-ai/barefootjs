import { createFixture } from '../src/types'

/**
 * Unary minus over a compound operand, in an attribute and in text, from
 * props and from a signal: `-(n + 1)` negates the whole sum, so it is `-6`
 * for `n = 5`, not `-n + 1`. A target whose prefix `-` binds tighter than
 * its infix operators needs the source grouping kept, and a negated
 * negation must not become `--n`, a decrement in PHP and Perl
 * (`groupUnaryOperand`).
 */
export const fixture = createFixture({
  id: 'unary-minus-compound-operand',
  description: 'Unary minus over a compound operand keeps its grouping (-(n + 1) → -6)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UnaryMinusCompoundOperand(props: { n: number; m: number }) {
  const [x] = createSignal(3)
  return (
    <p data-sum={-(props.n + 1)}>
      <span>{-(props.n + 1)}</span>
      <span>{-(x() * props.m)}</span>
      <span>{-(x() - props.m) * 2}</span>
      <span>{-(-props.n)}</span>
    </p>
  )
}
`,
  props: { n: 5, m: 2 },
  expectedHtml: `
    <p bf-s="test" bf="s8" data-sum="-6">
      <span bf="s1"><!--bf:s0-->-6<!--/--></span>
      <span bf="s3"><!--bf:s2-->-6<!--/--></span>
      <span bf="s5"><!--bf:s4-->-2<!--/--></span>
      <span bf="s7"><!--bf:s6-->5<!--/--></span>
    </p>
  `,
})
