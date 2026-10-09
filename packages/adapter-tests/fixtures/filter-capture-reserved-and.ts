import { createFixture } from '../src/types'

/**
 * Sibling of `filter-capture-shadowed-by-map-param` (#3402): the captured
 * name is `and`, a keyword in Jinja and MiniJinja that the adapters mangle.
 * The predicate still reads the enclosing value.
 */
export const fixture = createFixture({
  id: 'filter-capture-reserved-and',
  description: 'A filter capture named like a template keyword reads the enclosing value',
  source: `
export function FilterCaptureReservedAnd(props: { tags: string[] }) {
  return (
    <ul>{props.tags.map(and => (
      <li key={and}>{props.tags.filter(t => t === and).map(and => <i key={and}>{and}</i>)}</li>
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
