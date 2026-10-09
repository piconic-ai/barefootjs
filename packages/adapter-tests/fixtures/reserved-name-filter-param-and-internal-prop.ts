import { createFixture } from '../src/types'

/**
 * Sibling of `reserved-name-and-internal-twin` (#3404): a `.filter()` param
 * named `loop` next to a prop named `__bf_loop`. Jinja, MiniJinja, Twig,
 * Pebble and Blade rename the param to `__bf_loop`, so the predicate would
 * read the prop. Those adapters refuse with BF105.
 */
export const fixture = createFixture({
  id: 'reserved-name-filter-param-and-internal-prop',
  description: 'A filter param named loop next to a prop named __bf_loop filters by the item, or the adapter refuses',
  source: `
export function ReservedNameFilterParamAndInternalProp(props: {
  items: { visible: boolean; label: string }[]
  __bf_loop: { visible: boolean }
}) {
  return <div>{props.items.filter(loop => loop.visible).map(item => <span key={item.label}>{item.label}</span>)}</div>
}
`,
  props: { items: [{ visible: true, label: 'keep' }, { visible: false, label: 'drop' }], __bf_loop: { visible: false } },
  expectedHtml: `
    <div bf-s="test" bf="s1"><span data-key="keep"><!--bf:s0-->keep<!--/--></span></div>
  `,
  escapes: [{ kind: 'rewrite', fixture: 'reserved-name-filter-param-renamed' }],
})
