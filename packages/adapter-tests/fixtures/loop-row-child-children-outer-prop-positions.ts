import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-outer-prop`: the forwarded children
 * read the enclosing component's props in an attribute, in arithmetic with
 * the row index, in a condition, in a nested loop's array and row (next to
 * both rows), and in a nested component's prop.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-outer-prop-positions',
  description: "A component loop row's forwarded children read the enclosing component's props in attribute, condition, nested loop and nested component positions",
  source: `
'use client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

function Mark(props: { tone: string }) {
  return <u data-tone={props.tone} />
}

type Item = { id: string; label: string }

export function LoopRowChildChildrenOuterPropPositions(props: { pre: string; on: boolean; n: number; extra: string[]; items: Item[] }) {
  return (
    <ul>
      {props.items.map((o, i) => (
        <Chip key={o.id}>
          <i title={props.pre} data-n={props.n + i}>{o.label}</i>
          {props.on ? <b>{props.pre}</b> : null}
          {props.extra.map(x => <s key={x}>{x}{props.pre}{o.id}</s>)}
          <Mark tone={props.pre} />
        </Chip>
      ))}
    </ul>
  )
}
`,
  props: { pre: 'P', on: true, n: 2, extra: ['u', 'v'], items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s11">
      <em bf-s="Chip_*" data-key="a">
        <i bf="^s1" data-n="2" title="P"><!--bf:^s0-->A<!--/--></i>
        <b bf-c="^s2" bf="^s4"><!--bf:^s3-->P<!--/--></b>
        <s bf="^s8" data-key-1="u"><!--bf:^s5-->u<!--/--><!--bf:^s6-->P<!--/--><!--bf:^s7-->a<!--/--></s>
        <s bf="^s8" data-key-1="v"><!--bf:^s5-->v<!--/--><!--bf:^s6-->P<!--/--><!--bf:^s7-->a<!--/--></s>
        <u bf-s="test_s9" bf="s0" data-tone="P"></u>
      </em>
      <em bf-s="Chip_*" data-key="b">
        <i bf="^s1" data-n="3" title="P"><!--bf:^s0-->B<!--/--></i>
        <b bf-c="^s2" bf="^s4"><!--bf:^s3-->P<!--/--></b>
        <s bf="^s8" data-key-1="u"><!--bf:^s5-->u<!--/--><!--bf:^s6-->P<!--/--><!--bf:^s7-->b<!--/--></s>
        <s bf="^s8" data-key-1="v"><!--bf:^s5-->v<!--/--><!--bf:^s6-->P<!--/--><!--bf:^s7-->b<!--/--></s>
        <u bf-s="test_s9" bf="s0" data-tone="P"></u>
      </em>
    </ul>
  `,
})
