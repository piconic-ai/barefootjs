import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-omitted-prop-row-field`: the rows carry a
 * string, a number and a boolean field (`0` and `false` included) named like
 * the child's optional props. One loop omits all three while its forwarded
 * children read the row's field and an enclosing prop of the same name; the
 * other passes one prop from that enclosing prop and one from the row.
 */
export const fixture = createFixture({
  id: 'loop-row-child-omitted-prop-row-field-shapes',
  description: "A component loop row keeps string, number and boolean row fields apart from the child's same-named props, passed or omitted",
  source: `
'use client'

function Chip(props: { tone?: string; size?: number; on?: boolean; children?: any }) {
  return <em data-tone={props.tone} data-size={props.size} data-on={props.on}>{props.children}</em>
}

type Opt = { id: string; tone: string; size: number; on: boolean }

export function LoopRowChildOmittedPropRowFieldShapes({ opts, tone }: { opts: Opt[]; tone: string }) {
  return (
    <ul>
      {opts.map(o => (
        <Chip key={o.id}><i>{o.id}{o.tone}{tone}</i></Chip>
      ))}
      {opts.map(o => (
        <Chip key={o.id} tone={tone} size={o.size}><i>{o.id}</i></Chip>
      ))}
    </ul>
  )
}
`,
  props: { tone: 'T', opts: [{ id: 'a', tone: 'red', size: 1, on: true }, { id: 'b', tone: 'blue', size: 0, on: false }] },
  expectedHtml: `
    <ul bf-s="test" bf="s7">
      <em bf-s="Chip_*" bf="s0" data-key="a"><i bf="^s3"><!--bf:^s0-->a<!--/--><!--bf:^s1-->red<!--/--><!--bf:^s2-->T<!--/--></i></em>
      <em bf-s="Chip_*" bf="s0" data-key="b"><i bf="^s3"><!--bf:^s0-->b<!--/--><!--bf:^s1-->blue<!--/--><!--bf:^s2-->T<!--/--></i></em>
      <em bf-s="Chip_*" bf="s0" data-key="a" data-size="1" data-tone="T"><i><!--bf:^s5-->a<!--/--></i></em>
      <em bf-s="Chip_*" bf="s0" data-key="b" data-size="0" data-tone="T"><i><!--bf:^s5-->b<!--/--></i></em>
    </ul>
  `,
})
