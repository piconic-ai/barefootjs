import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-filter-captures-shadowing-param` (#3396): a
 * `.filter()` predicate in a nested loop captures both the enclosing row's
 * item param and the outer row's destructure binding, with no shadowing.
 * Each inner row keeps the tags equal to its own tag or to the group name.
 * The list is a prop; `nested-loop-filter-reads-outer-destructure-list`
 * reads it from the outer destructure binding instead (#3397).
 */
export const fixture = createFixture({
  id: 'nested-loop-filter-captures-outer-bindings',
  description: 'A filter predicate captures an enclosing item param and an outer destructure binding',
  source: `
export function NestedLoopFilterCapturesOuterBindings(props: { groups: { name: string }[]; tags: string[] }) {
  return (
    <ul>{props.groups.map(({ name }) => (
      <li key={name}>{props.tags.map(tag => (
        <b key={tag}>{props.tags.filter(t => t === tag || t === name).map(t => <i key={t}>{t}</i>)}</b>
      ))}</li>
    ))}</ul>
  )
}
`,
  props: { groups: [{ name: 'a' }], tags: ['a', 'b', 'c'] },
  expectedHtml: `
    <ul bf-s="test" bf="s3"><li bf="s2" data-key="a"><b bf="s1" data-key-1="a"><i data-key-2="a"><!--bf:s0-->a<!--/--></i></b><b bf="s1" data-key-1="b"><i data-key-2="a"><!--bf:s0-->a<!--/--></i><i data-key-2="b"><!--bf:s0-->b<!--/--></i></b><b bf="s1" data-key-1="c"><i data-key-2="a"><!--bf:s0-->a<!--/--></i><i data-key-2="c"><!--bf:s0-->c<!--/--></i></b></li></ul>
  `,
})
