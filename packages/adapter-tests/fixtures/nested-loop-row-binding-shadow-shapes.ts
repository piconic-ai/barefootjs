import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-index-shadows-row-binding` (#3392): an inner
 * loop's item param and an inner preamble local, each named like the outer
 * row's destructure binding, shadow it only inside the inner row. The outer
 * row still reads its own binding after each inner loop.
 */
export const fixture = createFixture({
  id: 'nested-loop-row-binding-shadow-shapes',
  description: 'An inner item param or preamble local named like an outer row binding leaves the binding intact',
  source: `
'use client'
export function NestedLoopRowBindingShadowShapes(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}>
        <span>{tags.map(name => <b key={name}>{name}</b>)}</span>{name}
        <em>{tags.map(t => {
          const name = t + '!'
          return <i key={t}>{name}</i>
        })}</em>{name}
      </li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }, { name: 'g2', tags: ['c'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s6">
      <li data-key="g1">
        <span bf="s1">
          <b data-key-1="a"><!--bf:s0-->a<!--/--></b>
          <b data-key-1="b"><!--bf:s0-->b<!--/--></b>
        </span>
        <!--bf:s2-->g1<!--/-->
        <em bf="s4">
          <i data-key-1="a"><!--bf:s3-->a!<!--/--></i>
          <i data-key-1="b"><!--bf:s3-->b!<!--/--></i>
        </em>
        <!--bf:s5-->g1<!--/-->
      </li>
      <li data-key="g2">
        <span bf="s1"><b data-key-1="c"><!--bf:s0-->c<!--/--></b></span>
        <!--bf:s2-->g2<!--/-->
        <em bf="s4"><i data-key-1="c"><!--bf:s3-->c!<!--/--></i></em>
        <!--bf:s5-->g2<!--/-->
      </li>
    </ul>
  `,
})
