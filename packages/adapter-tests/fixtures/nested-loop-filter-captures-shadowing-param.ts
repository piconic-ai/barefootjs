import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-row-binding-shadow-shapes` (#3392): a `.filter()`
 * predicate inside a row whose item param shadows the outer row's
 * destructure binding captures the inner param, so each inner row keeps
 * only the tags equal to its own item.
 */
export const fixture = createFixture({
  id: 'nested-loop-filter-captures-shadowing-param',
  description: 'A filter predicate captures the inner item param that shadows an outer row binding',
  source: `
export function NestedLoopFilterCapturesShadowingParam(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}>{tags.map(name => (
        <b key={name}>{tags.filter(t => t === name).map(t => <i key={t}>{t}</i>)}</b>
      ))}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'g1', tags: ['a', 'b'] }] },
  expectedHtml: `
    <ul bf-s="test" bf="s3"><li bf="s2" data-key="g1"><b bf="s1" data-key-1="a"><i data-key-2="a"><!--bf:s0-->a<!--/--></i></b><b bf="s1" data-key-1="b"><i data-key-2="b"><!--bf:s0-->b<!--/--></i></b></li></ul>
  `,
})
