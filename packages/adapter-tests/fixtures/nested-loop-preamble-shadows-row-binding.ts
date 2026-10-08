import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-index-shadows-row-binding` (#3392): an inner
 * loop's preamble local named like the outer row's destructure binding
 * shadows it only inside the inner row. The outer row still reads its own
 * binding after the inner loop. CSR is skipped (#3394).
 */
export const fixture = createFixture({
  id: 'nested-loop-preamble-shadows-row-binding',
  description: 'An inner preamble local named like an outer row binding leaves the binding intact',
  source: `
'use client'
export function NestedLoopPreambleShadowsRowBinding(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}><em>{tags.map(t => {
        const name = t + '!'
        return <i key={t}>{name}</i>
      })}</em>{name}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }, { name: 'g2', tags: ['c'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li data-key="g1"><em bf="s1"><i data-key-1="a"><!--bf:s0-->a!<!--/--></i><i data-key-1="b"><!--bf:s0-->b!<!--/--></i></em><!--bf:s2-->g1<!--/--></li>
      <li data-key="g2"><em bf="s1"><i data-key-1="c"><!--bf:s0-->c!<!--/--></i></em><!--bf:s2-->g2<!--/--></li>
    </ul>
  `,
})
