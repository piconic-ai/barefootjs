import { createFixture } from '../src/types'

/**
 * A string joined with a number by `+` in every position a template
 * expression reaches: an attribute, text, both operand orders, a ternary
 * branch, an `&&` operand, a memo read, a template literal, a child prop, a
 * destructured child, a loop row key, a nested loop and a `.filter()`
 * predicate. JS `+` stringifies the number, so a fraction, an exponent and a
 * negative number keep their JS spelling (`1.5`, `1e+21`, `-3`).
 */
export const fixture = createFixture({
  id: 'string-number-plus-concat-positions',
  description: 'A string joined with a number by + stringifies the number as JS does, in every template position',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Badge(props: { label: string }) {
  return <em>{props.label}</em>
}

function Line({ label, count }: { label: string; count: number }) {
  return <i title={label + count}>{count + ':' + label}</i>
}

type Row = { id: string; n: number; tags: number[] }

export function StringNumberPlusConcatPositions(props: { label: string; count: number; ratio: number; on: boolean; rows: Row[]; nums: number[] }) {
  const [count, setCount] = createSignal(props.count)
  const doubled = createMemo(() => count() * 2)
  return (
    <div data-attr={props.label + count()} title={'r=' + props.ratio}>
      <span>{props.label + ':' + count()}</span>
      <span>{count() + props.label}</span>
      <span>{props.on ? 'on=' + props.ratio : 'off'}</span>
      <span>{props.on && 'b=' + props.ratio}</span>
      <span>{'d=' + doubled()}</span>
      <span>{\`t=\${'x' + count()}\`}</span>
      <Badge label={'c=' + count()} />
      <Line label={props.label} count={props.ratio} />
      <ul>
        {props.rows.map((r, i) => (
          <li key={r.id + ':' + i}>
            {r.id + '/' + r.n}
            {r.tags.map(t => <b key={'k' + t}>{'t' + t}</b>)}
          </li>
        ))}
      </ul>
      <ol>{props.nums.filter(v => 'v' + v !== 'v0').map(v => <li key={v + '!'}>{'v=' + v}</li>)}</ol>
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
`,
  props: {
    label: 'L',
    count: 0,
    ratio: 1.5,
    on: true,
    rows: [
      { id: 'a', n: 1e21, tags: [0, 2] },
      { id: 'b', n: -3, tags: [] },
    ],
    nums: [0, 2.5, -1],
  },
  expectedHtml: `
    <div bf-s="test" bf="s23" data-attr="L0" title="r=1.5">
      <span bf="s1"><!--bf:s0-->L:0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0L<!--/--></span>
      <span bf="s6"><!--bf-cond-start:s4--><!--bf:s5-->on=1.5<!--/--><!--bf-cond-end:s4--></span>
      <span bf="s9"><!--bf-cond-start:s7--><!--bf:s8-->b=1.5<!--/--><!--bf-cond-end:s7--></span>
      <span bf="s11"><!--bf:s10-->d=0<!--/--></span>
      <span bf="s13"><!--bf:s12-->t=x0<!--/--></span>
      <em bf-s="test_s14" bf="s1"><!--bf:s0-->c=0<!--/--></em>
      <i bf-s="test_s15" bf="s1" title="L1.5"><!--bf:s0-->1.5:L<!--/--></i>
      <ul bf="s19">
        <li bf="s18" data-key="a:0">
          <!--bf:s16-->a/1e+21<!--/-->
          <b data-key-1="k0"><!--bf:s17-->t0<!--/--></b>
          <b data-key-1="k2"><!--bf:s17-->t2<!--/--></b>
        </li>
        <li bf="s18" data-key="b:1"><!--bf:s16-->b/-3<!--/--></li>
      </ul>
      <ol bf="s21">
        <li data-key="2.5!"><!--bf:s20-->v=2.5<!--/--></li>
        <li data-key="-1!"><!--bf:s20-->v=-1<!--/--></li>
      </ol>
      <button bf="s22">+</button>
    </div>
  `,
})
