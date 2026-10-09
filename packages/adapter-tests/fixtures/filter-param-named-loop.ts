import { createFixture } from '../src/types'

/**
 * Sibling of `map-param-named-loop` (#3404): a `.filter()` param named
 * `loop` feeding a differently named `.map()` param. The adapters that
 * rename `loop` must rewrite the renamed name in the predicate to the row
 * item, or the predicate reads an unbound variable.
 */
export const fixture = createFixture({
  id: 'filter-param-named-loop',
  description: 'A filter param named loop tests each item of the map row',
  source: `
export function FilterParamNamedLoop(props: { items: { visible: boolean; label: string }[] }) {
  return <div>{props.items.filter(loop => loop.visible).map(item => <span key={item.label}>{item.label}</span>)}</div>
}
`,
  props: { items: [{ visible: true, label: 'keep' }, { visible: false, label: 'drop' }] },
  expectedHtml: `
    <div bf-s="test" bf="s1"><span data-key="keep"><!--bf:s0-->keep<!--/--></span></div>
  `,
})
