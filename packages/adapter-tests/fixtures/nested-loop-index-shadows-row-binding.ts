import { createFixture } from '../src/types'

/**
 * Sibling of `loop-set-bound-param-shadow` (#3391): an inner loop's index
 * named like the outer row's destructure binding shadows it only inside
 * the inner row, and the outer row still reads its own binding after the
 * inner loop.
 */
export const fixture = createFixture({
  id: 'nested-loop-index-shadows-row-binding',
  description: 'An inner index named like an outer row binding leaves the binding intact after the inner loop',
  source: `
'use client'
export function NestedLoopIndexShadowsRowBinding(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}><span>{tags.map((t, name) => <b key={t}>{t}{name}</b>)}</span>{name}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }, { name: 'g2', tags: ['c'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s4">
      <li data-key="g1"><span bf="s2"><b data-key-1="a"><!--bf:s0-->a<!--/--><!--bf:s1-->0<!--/--></b><b data-key-1="b"><!--bf:s0-->b<!--/--><!--bf:s1-->1<!--/--></b></span><!--bf:s3-->g1<!--/--></li>
      <li data-key="g2"><span bf="s2"><b data-key-1="c"><!--bf:s0-->c<!--/--><!--bf:s1-->0<!--/--></b></span><!--bf:s3-->g2<!--/--></li>
    </ul>
  `,
})
