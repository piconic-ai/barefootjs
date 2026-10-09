import { createFixture } from '../src/types'

/**
 * Sibling of `reserved-name-filter-param-and-internal-prop` (#3404): a
 * `.filter()` param named `loop` feeds a `.map()` param named `__bf_loop`.
 * The two are separate callbacks, so BF105 does not fire and every adapter
 * filters by the item.
 */
export const fixture = createFixture({
  id: 'reserved-name-filter-param-feeds-internal-map-param',
  description: 'A filter param named loop feeding a map param named __bf_loop filters by the item',
  source: `
export function ReservedNameFilterParamFeedsInternalMapParam(props: { items: string[] }) {
  return <ul>{props.items.filter(loop => loop !== 'drop').map(__bf_loop => <li key={__bf_loop}>{__bf_loop}</li>)}</ul>
}
`,
  props: { items: ['keep', 'drop'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1"><li data-key="keep"><!--bf:s0-->keep<!--/--></li></ul>
  `,
})
