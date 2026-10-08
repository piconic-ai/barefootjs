import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-index-shadows-row-binding` (#3392): an inner
 * `.keys().map()` callback param named like the outer row's destructure
 * binding is the inner index only inside the inner row. The outer row still
 * reads its own binding after the inner loop.
 */
export const fixture = createFixture({
  id: 'nested-loop-keys-shadows-row-binding',
  description: 'An inner keys() callback param named like an outer row binding leaves the binding intact',
  source: `
export function NestedLoopKeysShadowsRowBinding(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}><span>{tags.keys().map(name => <b key={name}>{name}</b>)}</span>{name}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3"><li data-key="g1"><span bf="s1"><b data-key-1="0"><!--bf:s0-->0<!--/--></b><b data-key-1="1"><!--bf:s0-->1<!--/--></b></span><!--bf:s2-->g1<!--/--></li></ul>
  `,
})
