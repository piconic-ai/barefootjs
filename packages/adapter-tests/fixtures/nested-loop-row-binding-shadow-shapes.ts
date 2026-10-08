import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-index-shadows-row-binding` (#3392): an inner
 * loop's item param named like the outer row's destructure binding shadows
 * it only inside the inner row. The outer row still reads its own binding
 * after the inner loop.
 */
export const fixture = createFixture({
  id: 'nested-loop-row-binding-shadow-shapes',
  description: 'An inner item param named like an outer row binding leaves the binding intact',
  source: `
'use client'
export function NestedLoopRowBindingShadowShapes(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}><span>{tags.map(name => <b key={name}>{name}</b>)}</span>{name}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }, { name: 'g2', tags: ['c'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="g1"><span bf="s1"><b data-key-1="a"><!--bf:s0-->a<!--/--></b><b data-key-1="b"><!--bf:s0-->b<!--/--></b></span><!--bf:s2-->g1<!--/--></li>
      <li data-key="g2"><span bf="s1"><b data-key-1="c"><!--bf:s0-->c<!--/--></b></span><!--bf:s2-->g2<!--/--></li>
    </ul>
  `,
})
