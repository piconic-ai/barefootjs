import { createFixture } from '../src/types'

/**
 * `number` values passed as the integer arguments of array and string
 * methods: a prop as `slice`'s end and `at`'s index, signals as
 * `repeat`'s count, `padStart`'s length and `toFixed`'s digits, plus a
 * `.length` memo. An engine that holds a JS number as a double must
 * still accept it where the method takes an integer. (The counts come
 * from signals so the generated data points, which vary props only,
 * never ask for a huge or negative repeat.)
 */
export const fixture = createFixture({
  id: 'number-prop-integer-args',
  description: 'Number props and signals as integer method arguments (slice, at, repeat, padStart, toFixed) and a .length memo',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function NumberPropIntegerArgs(props: { items: string[]; n: number; price: number }) {
  const [count] = createSignal(2)
  const [width] = createSignal(3)
  const size = createMemo(() => props.items.length)
  return (
    <p data-count={size()}>
      <span>{props.items.slice(0, props.n).join(',')}</span>
      <span>{props.items.at(props.n)}</span>
      <span>{'ab'.repeat(count())}</span>
      <span>{'7'.padStart(width(), '0')}</span>
      <span>{props.price.toFixed(count())}</span>
      <span>{size()}</span>
    </p>
  )
}
`,
  props: { items: ['a', 'b', 'c'], n: 2, price: 2.5 },
  expectedHtml: `
    <p bf-s="test" bf="s12" data-count="3">
      <span bf="s1"><!--bf:s0-->a,b<!--/--></span>
      <span bf="s3"><!--bf:s2-->c<!--/--></span>
      <span bf="s5"><!--bf:s4-->abab<!--/--></span>
      <span bf="s7"><!--bf:s6-->007<!--/--></span>
      <span bf="s9"><!--bf:s8-->2.50<!--/--></span>
      <span bf="s11"><!--bf:s10-->3<!--/--></span>
    </p>
  `,
})
