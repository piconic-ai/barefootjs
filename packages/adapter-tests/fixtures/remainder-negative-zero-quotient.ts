import { createFixture } from '../src/types'

/**
 * The `-0` of `remainder-negative-zero` divided into, in a template
 * expression: `1 / (-4 % 2)` is `1 / -0`, which JS gives as `-Infinity`,
 * from a prop and from a signal, in an attribute and in text. An integer
 * remainder (`0`) loses the sign and gives `Infinity`. A backend whose `/`
 * mishandles any zero divisor diverges here for that reason first
 * (`number-division-zero-divisor`). The sign also decides a ternary, and
 * the `-0` key reads a list as index `0` beside it, in the component body
 * and in a loop row.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero-quotient',
  description: 'Dividing by the -0 remainder of a negative dividend gives -Infinity (1 / (-4 % 2))',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNegativeZeroQuotient(props: { n: number }) {
  const [x] = createSignal(-4)
  const [xs] = createSignal([-4, 4])
  return (
    <p data-sign={1 / (x() % 2)}>
      <span>{1 / (props.n % 2)}</span>
      <span>{1 / (x() % 2)}</span>
      <span>{1 / (x() % 2) < 0 ? 'neg' : 'pos'}</span>
      <span>{['even', 'odd'][x() % 2]}</span>
      <ul>{xs().map(v => <li key={v}><b>{1 / (v % 2)}</b><i>{['even', 'odd'][v % 2]}</i></li>)}</ul>
    </p>
  )
}
`,
  props: { n: -4 },
  expectedHtml: `
    <p bf-s="test" bf="s11" data-sign="-Infinity">
      <span bf="s1"><!--bf:s0-->-Infinity<!--/--></span>
      <span bf="s3"><!--bf:s2-->-Infinity<!--/--></span>
      <span bf="s5"><!--bf-cond-start:s4-->neg<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf:s6-->even<!--/--></span>
      <ul bf="s10">
        <li data-key="-4">
          <b><!--bf:s8-->-Infinity<!--/--></b>
          <i><!--bf:s9-->even<!--/--></i>
        </li>
        <li data-key="4">
          <b><!--bf:s8-->Infinity<!--/--></b>
          <i><!--bf:s9-->even<!--/--></i>
        </li>
      </ul>
    </p>
  `,
})
