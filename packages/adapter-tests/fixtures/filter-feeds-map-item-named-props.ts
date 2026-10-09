import { createFixture } from '../src/types'

/**
 * Sibling of `filter-param-named-loop` (#3404): a `.filter()` feeding a
 * `.map()` whose item is named `props`. Renaming the filter param to the row
 * item must keep `props.visible` a read of the row, not of the component
 * props.
 */
export const fixture = createFixture({
  id: 'filter-feeds-map-item-named-props',
  description: 'A filter feeding a map item named props tests each row',
  source: `
export function FilterFeedsMapItemNamedProps({ items }: { items: { visible: boolean }[] }) {
  return <ul>{items.filter(t => t.visible).map((props, i) => <li key={i}>keep</li>)}</ul>
}
`,
  props: { items: [{ visible: true }, { visible: false }] },
  expectedHtml: `
    <ul bf-s="test" bf="s0"><li data-key="0">keep</li></ul>
  `,
})
