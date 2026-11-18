import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-outer-prop` over a module-scope
 * array, with the prop destructured.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-outer-prop-module-const',
  description: "A component loop row over a module-scope array forwards children that read a destructured prop of the enclosing component",
  source: `
'use client'

function Chip(props: { children?: any }) {
  return <em>{props.children}</em>
}

const OPTS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]

export function LoopRowChildChildrenOuterPropModuleConst({ pre }: { pre: string }) {
  return (
    <ul>
      {OPTS.map(o => (
        <Chip key={o.id}>{pre}<i>{o.label}</i></Chip>
      ))}
    </ul>
  )
}
`,
  props: { pre: 'P:' },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <em bf-s="Chip_*" data-key="a"><!--bf:^s0-->P:<!--/--><i><!--bf:^s1-->A<!--/--></i></em>
      <em bf-s="Chip_*" data-key="b"><!--bf:^s0-->P:<!--/--><i><!--bf:^s1-->B<!--/--></i></em>
    </ul>
  `,
})
