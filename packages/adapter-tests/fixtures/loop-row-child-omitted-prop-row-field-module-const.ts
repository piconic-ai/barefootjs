import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-omitted-prop-row-field` over a module-scope
 * array.
 */
export const fixture = createFixture({
  id: 'loop-row-child-omitted-prop-row-field-module-const',
  description: "A component loop row over a module-scope array does not hand the child a row field named like a prop the call omits",
  source: `
'use client'

function Chip(props: { tone?: string; children?: any }) {
  return <em data-tone={props.tone}>{props.children}</em>
}

const OPTS = [{ id: 'a', tone: 'red' }, { id: 'b', tone: 'blue' }]

export function LoopRowChildOmittedPropRowFieldModuleConst() {
  return (
    <ul>
      {OPTS.map(o => (
        <Chip key={o.id}><i>{o.id}</i></Chip>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <em bf-s="Chip_*" bf="s0" data-key="a"><i><!--bf:^s0-->a<!--/--></i></em>
      <em bf-s="Chip_*" bf="s0" data-key="b"><i><!--bf:^s0-->b<!--/--></i></em>
    </ul>
  `,
})
