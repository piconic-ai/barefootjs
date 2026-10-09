import { createFixture } from '../src/types'

/**
 * Escape twin of `reserved-name-filter-param-and-internal-prop` (#3404): the
 * filter param is renamed from `loop` to `entry`, so the adapters that
 * refuse the collision with BF105 filter by the item.
 */
export const fixture = createFixture({
  id: 'reserved-name-filter-param-renamed',
  description: 'A filter param renamed away from loop filters by the item next to a prop named __bf_loop',
  source: `
export function ReservedNameFilterParamRenamed(props: {
  items: { visible: boolean; label: string }[]
  __bf_loop: { visible: boolean }
}) {
  return <div>{props.items.filter(entry => entry.visible).map(item => <span key={item.label}>{item.label}</span>)}</div>
}
`,
  props: { items: [{ visible: true, label: 'keep' }, { visible: false, label: 'drop' }], __bf_loop: { visible: false } },
  expectedHtml: `
    <div bf-s="test" bf="s1"><span data-key="keep"><!--bf:s0-->keep<!--/--></span></div>
  `,
})
