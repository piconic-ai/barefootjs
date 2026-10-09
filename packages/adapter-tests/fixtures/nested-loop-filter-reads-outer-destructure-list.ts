import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-filter-captures-outer-bindings` (#3397): the list
 * the nested `.filter()` reads is the outer row's destructure binding
 * (`tags`), not a prop, and the inner `.map()` param shadows the other
 * outer binding (`name`). The client JS must read the outer list through
 * the outer row's accessor at every depth.
 */
export const fixture = createFixture({
  id: 'nested-loop-filter-reads-outer-destructure-list',
  description: 'A nested filter reads the outer row destructure list and a shadowing inner param',
  source: `
export function NestedLoopFilterReadsOuterDestructureList(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}>{tags.map(name => (
        <b key={name}>{tags.filter(t => t === name).map(t => <i key={t}>{t}</i>)}</b>
      ))}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g', tags: ['a', 'b'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3"><li bf="s2" data-key="g"><b bf="s1" data-key-1="a"><i data-key-2="a"><!--bf:s0-->a<!--/--></i></b><b bf="s1" data-key-1="b"><i data-key-2="b"><!--bf:s0-->b<!--/--></i></b></li></ul>
  `,
})
