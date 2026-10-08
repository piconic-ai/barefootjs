import { createFixture } from '../src/types'

/**
 * Sibling of `filter-capture-shadowed-by-map-param` (#3402): the predicate
 * also compares against the string literal `"name"`, spelled like the
 * captured binding. Only the captured reference reads the enclosing value;
 * the literal keeps its text.
 */
export const fixture = createFixture({
  id: 'filter-capture-keeps-same-name-literal',
  description: 'A filter capture keeps a string literal spelled like the captured name intact',
  source: `
export function FilterCaptureKeepsSameNameLiteral(props: { tags: string[] }) {
  return (
    <ul>{props.tags.map(name => (
      <li key={name}>{props.tags.filter(t => t === name || t === "name").map(name => <i key={name}>{name}</i>)}</li>
    ))}</ul>
  )
}
`,
  props: { tags: ['name', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li bf="s1" data-key="name"><i data-key-1="name"><!--bf:s0-->name<!--/--></i></li>
      <li bf="s1" data-key="b">
        <i data-key-1="name"><!--bf:s0-->name<!--/--></i>
        <i data-key-1="b"><!--bf:s0-->b<!--/--></i>
      </li>
    </ul>
  `,
})
