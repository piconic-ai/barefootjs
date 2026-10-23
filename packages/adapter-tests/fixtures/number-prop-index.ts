import { createFixture } from '../src/types'

/**
 * A `number` prop used as an array index, in a value and in a condition,
 * and compared with `.length`. Holding a JS number as a double must still
 * index a list (`items[1]`) and compare with an integer length.
 */
export const fixture = createFixture({
  id: 'number-prop-index',
  description: 'A number prop indexes an array prop (value and condition) and compares with its length',
  source: `
export function NumberPropIndex(props: { items: string[]; flags: boolean[]; i: number }) {
  return (
    <p data-pick={props.items[props.i]}>
      <span>{props.items[props.i]}</span>
      <span>{props.i < props.items.length ? 'in' : 'out'}</span>
      <span>{props.items.length - props.i}</span>
      {props.flags[props.i] ? <b>on</b> : <i>off</i>}
    </p>
  )
}
`,
  props: { items: ['a', 'b', 'c'], flags: [false, true], i: 1 },
  expectedHtml: `
    <p bf-s="test" bf="s7" data-pick="b">
      <span bf="s1"><!--bf:s0-->b<!--/--></span>
      <span bf="s3"><!--bf-cond-start:s2-->in<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf:s4-->2<!--/--></span>
      <b bf-c="s6">on</b>
    </p>
  `,
})
