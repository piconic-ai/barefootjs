import { createFixture } from '../src/types'

/**
 * Loop rows keyed by a `.toString()` call: the row value of a string array
 * (`x.toString()`) and the map index (`i.toString()`) on a component row and
 * on a plain element row, and the row value of a number array
 * (`n.toString()`) on an element row. Every row renders `data-key` with the
 * stringified value, the same as `String(x)` would give. A template that
 * reads `x.toString` as a property instead of calling it renders an empty
 * `data-key`, or none at all on a component row (#3621). The number array's
 * component row is `loop-key-to-string-number-component-row`.
 */
export const fixture = createFixture({
  id: 'loop-key-to-string',
  description: 'Loop rows keyed by x.toString() / i.toString() (component and element rows) and n.toString() (element row) render data-key',
  source: `
'use client'

function Item(props: { label: string }) {
  return <li className="item">{props.label}</li>
}

export function LoopKeyToString(props: { names: string[]; values: number[] }) {
  return (
    <div>
      <ul className="c-str">{props.names.map(x => <Item key={x.toString()} label={x} />)}</ul>
      <ul className="c-idx">{props.names.map((x, i) => <Item key={i.toString()} label={x} />)}</ul>
      <ul className="e-str">{props.names.map(x => <li key={x.toString()}>{x}</li>)}</ul>
      <ul className="e-num">{props.values.map(n => <li key={n.toString()}>{n}</li>)}</ul>
      <ul className="e-idx">{props.names.map((x, i) => <li key={i.toString()}>{x}</li>)}</ul>
    </div>
  )
}
`,
  props: { names: ['p', 'q'], values: [1, 2.5] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1" class="c-str">
        <li bf-s="Item_*" bf="s1" class="item" data-key="p"><!--bf:s0-->p<!--/--></li>
        <li bf-s="Item_*" bf="s1" class="item" data-key="q"><!--bf:s0-->q<!--/--></li>
      </ul>
      <ul bf="s3" class="c-idx">
        <li bf-s="Item_*" bf="s1" class="item" data-key="0"><!--bf:s0-->p<!--/--></li>
        <li bf-s="Item_*" bf="s1" class="item" data-key="1"><!--bf:s0-->q<!--/--></li>
      </ul>
      <ul bf="s5" class="e-str">
        <li data-key="p"><!--bf:s4-->p<!--/--></li>
        <li data-key="q"><!--bf:s4-->q<!--/--></li>
      </ul>
      <ul bf="s7" class="e-num">
        <li data-key="1"><!--bf:s6-->1<!--/--></li>
        <li data-key="2.5"><!--bf:s6-->2.5<!--/--></li>
      </ul>
      <ul bf="s9" class="e-idx">
        <li data-key="0"><!--bf:s8-->p<!--/--></li>
        <li data-key="1"><!--bf:s8-->q<!--/--></li>
      </ul>
    </div>
  `,
})
