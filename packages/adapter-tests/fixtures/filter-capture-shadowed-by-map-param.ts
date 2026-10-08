import { createFixture } from '../src/types'

/**
 * Sibling of `nested-loop-filter-captures-outer-bindings` (#3396): the
 * `.map()` after a `.filter()` reuses the name the predicate captures from
 * the enclosing row. The predicate still compares against the enclosing
 * value, so each outer row keeps only its own tag.
 */
export const fixture = createFixture({
  id: 'filter-capture-shadowed-by-map-param',
  description: 'A filter predicate capture survives a following map param of the same name',
  source: `
export function FilterCaptureShadowedByMapParam(props: { tags: string[] }) {
  return (
    <ul>{props.tags.map(name => (
      <li key={name}>{props.tags.filter(t => t === name).map(name => <i key={name}>{name}</i>)}</li>
    ))}</ul>
  )
}
`,
  props: { tags: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="a"><i data-key-1="a"><!--bf:s0-->a<!--/--></i></li>
      <li bf="s1" data-key="b"><i data-key-1="b"><!--bf:s0-->b<!--/--></i></li>
    </ul>
  `,
})
