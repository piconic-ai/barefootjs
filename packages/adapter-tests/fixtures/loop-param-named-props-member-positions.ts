import { createFixture } from '../src/types'

/**
 * Sibling of `loop-param-named-props-member`: a `.map()` row parameter
 * named `props` read in every row position — an attribute, the key, a
 * ternary, an `&&` branch, a prop forwarded into a child, a nested loop
 * over a row member and the nested row's text, and a `+` whose operands
 * are typed by the row (`n` is a string prop of the component but a number
 * in the row). The `.filter()` feeding the map and the `.some()` beside it
 * name their callback parameter `props` too. The component's own props
 * share the row members' names (`label`, `on`, `n`), so a row read that
 * reaches the component's props renders a visibly different value.
 */
export const fixture = createFixture({
  id: 'loop-param-named-props-member-positions',
  description: 'A .map() row parameter named props reads its own members in attributes, branches, child props and nested loops',
  source: `
function Tag({ text }: { text: string }) {
  return <b>{text}</b>
}
type Row = { label: string; on: boolean; cls: string; n: number; tags: string[] }
export function LoopParamNamedPropsMemberPositions({ rows, label, on, n }: { rows: Row[]; label: string; on: boolean; n: string }) {
  return (
    <div>
      <ul>
        {rows.filter((props) => props.on).map((props) => (
          <li key={props.label} className={props.cls}>
            {props.on ? props.label : 'off'}
            {props.on && <span>{props.label}</span>}
            <Tag text={props.label} />
            <em>{props.n + 1}</em>
            {props.tags.map((t) => <i key={t}>{props.label}-{t}</i>)}
          </li>
        ))}
      </ul>
      <p>{rows.some((props) => props.on) ? 'some' : 'none'} {label} {on ? 'on' : 'off'} {n}</p>
    </div>
  )
}
`,
  props: {
    rows: [
      { label: 'a', on: true, cls: 'x', n: 1, tags: ['t1', 't2'] },
      { label: 'b', on: false, cls: 'y', n: 2, tags: [] },
      { label: 'c', on: true, cls: 'z', n: 3, tags: ['t3'] },
    ],
    label: 'ROOT',
    on: false,
    n: '9',
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s12">
        <li bf="s11" class="x" data-key="a">
          <!--bf-cond-start:s0-->
          <!--bf:s1-->a<!--/-->
          <!--bf-cond-end:s0-->
          <span bf-c="s2" bf="s4"><!--bf:s3-->a<!--/--></span>
          <b bf-s="test_s5" bf="s1"><!--bf:s0-->a<!--/--></b>
          <em bf="s7"><!--bf:s6-->2<!--/--></em>
          <i bf="s10" data-key-1="t1"><!--bf:s8-->a<!--/-->-<!--bf:s9-->t1<!--/--></i>
          <i bf="s10" data-key-1="t2"><!--bf:s8-->a<!--/-->-<!--bf:s9-->t2<!--/--></i>
        </li>
        <li bf="s11" class="z" data-key="c">
          <!--bf-cond-start:s0-->
          <!--bf:s1-->c<!--/-->
          <!--bf-cond-end:s0-->
          <span bf-c="s2" bf="s4"><!--bf:s3-->c<!--/--></span>
          <b bf-s="test_s5" bf="s1"><!--bf:s0-->c<!--/--></b>
          <em bf="s7"><!--bf:s6-->4<!--/--></em>
          <i bf="s10" data-key-1="t3"><!--bf:s8-->c<!--/-->-<!--bf:s9-->t3<!--/--></i>
        </li>
      </ul>
      <p bf="s18"><!--bf-cond-start:s13-->some<!--bf-cond-end:s13--><!--bf:s14-->ROOT<!--/--><!--bf-cond-start:s15-->off<!--bf-cond-end:s15--><!--bf:s17-->9<!--/--></p>
    </div>
  `,
})
