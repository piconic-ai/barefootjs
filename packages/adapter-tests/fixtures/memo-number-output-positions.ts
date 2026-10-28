import { createFixture } from '../src/types'

/**
 * A number-valued memo printed wherever JS stringifies it: an infinite
 * quotient, fractions past 15 significant digits and a negative zero, read
 * in an attribute, text, a ternary branch (text and attribute), behind
 * `&&`, in a template literal and a string concatenation, in a loop row,
 * and forwarded to a child that prints its `number` prop. Every position
 * prints JS's `Number::toString` spelling (`-Infinity`,
 * `0.6666666666666666`, `666666.6666666666`, `0`), never a host spelling
 * such as Perl's `-Inf` / `%.15g`. The destructured twin is
 * `memo-number-output-positions-destructured`.
 */
export const fixture = createFixture({
  id: 'memo-number-output-positions',
  description: 'A number-valued memo prints as JS stringifies it in every output position',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
import { NumberLabel } from './number-label'
export function MemoNumberOutputPositions(props: { n: number; zero: number; on: boolean; items: string[] }) {
  const [count] = createSignal(-3)
  const negative = createMemo(() => count() / props.zero)
  const positive = createMemo(() => props.n / 0)
  const third = createMemo(() => props.n / 3)
  const scaled = createMemo(() => props.n * 1000000 / 3)
  const negZero = createMemo(() => count() * 0)
  return (
    <div data-negative={negative()} data-third={third()} data-pick={props.on ? negative() : 0} data-tpl={\`q=\${positive()}\`} data-cat={'x' + third()}>
      <span>{negative()}</span>
      <span>{positive()}</span>
      <span>{third()}</span>
      <span>{scaled()}</span>
      <span>{negZero()}</span>
      <span>{props.on ? negative() : 'off'}</span>
      <span>{props.on && positive()}</span>
      <span>{\`v=\${third()}\`}</span>
      <span>{'q=' + negative()}</span>
      <NumberLabel value={negative()} />
      <ul>{props.items.map(item => <li key={item}>{item}:{third()}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './number-label.tsx': `
export function NumberLabel(props: { value: number }) {
  return <i>{props.value}</i>
}
`,
  },
  props: { n: 2, zero: 0, on: true, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s25" data-cat="x0.6666666666666666" data-negative="-Infinity" data-pick="-Infinity" data-third="0.6666666666666666" data-tpl="q=Infinity">
      <span bf="s1"><!--bf:s0-->-Infinity<!--/--></span>
      <span bf="s3"><!--bf:s2-->Infinity<!--/--></span>
      <span bf="s5"><!--bf:s4-->0.6666666666666666<!--/--></span>
      <span bf="s7"><!--bf:s6-->666666.6666666666<!--/--></span>
      <span bf="s9"><!--bf:s8-->0<!--/--></span>
      <span bf="s12"><!--bf-cond-start:s10--><!--bf:s11-->-Infinity<!--/--><!--bf-cond-end:s10--></span>
      <span bf="s15"><!--bf-cond-start:s13--><!--bf:s14-->Infinity<!--/--><!--bf-cond-end:s13--></span>
      <span bf="s17"><!--bf:s16-->v=0.6666666666666666<!--/--></span>
      <span bf="s19"><!--bf:s18-->q=-Infinity<!--/--></span>
      <i bf-s="test_s20" bf="s1"><!--bf:s0-->-Infinity<!--/--></i>
      <ul bf="s24">
        <li bf="s23" data-key="a"><!--bf:s21-->a<!--/-->:<!--bf:s22-->0.6666666666666666<!--/--></li>
        <li bf="s23" data-key="b"><!--bf:s21-->b<!--/-->:<!--bf:s22-->0.6666666666666666<!--/--></li>
      </ul>
    </div>
  `,
})
