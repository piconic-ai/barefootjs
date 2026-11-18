import { createFixture } from '../src/types'

/**
 * A component loop row with forwarded children over rows that have a field
 * named like an optional prop of the child the call does not pass
 * (`opts.map(o => <Chip key={o.id}><i>{o.id}</i></Chip>)`, rows with `tone`,
 * `Chip` with `tone?`). The child's prop stays absent.
 */
export const fixture = createFixture({
  id: 'loop-row-child-omitted-prop-row-field',
  description: "A component loop row does not hand the child a row field named like a prop the call omits",
  source: `
'use client'

function Chip(props: { tone?: string; children?: any }) {
  return <em data-tone={props.tone}>{props.children}</em>
}

export function LoopRowChildOmittedPropRowField({ opts }: { opts: { id: string; tone: string }[] }) {
  return (
    <ul>
      {opts.map(o => (
        <Chip key={o.id}><i>{o.id}</i></Chip>
      ))}
    </ul>
  )
}
`,
  props: { opts: [{ id: 'a', tone: 'red' }, { id: 'b', tone: 'blue' }] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <em bf-s="Chip_*" bf="s0" data-key="a"><i><!--bf:^s0-->a<!--/--></i></em>
      <em bf-s="Chip_*" bf="s0" data-key="b"><i><!--bf:^s0-->b<!--/--></i></em>
    </ul>
  `,
})
