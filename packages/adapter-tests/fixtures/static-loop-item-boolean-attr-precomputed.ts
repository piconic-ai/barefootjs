import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-loop-item-boolean-attr` — the base
 * refuses on the Go template adapter's `#2898` pre-fix history and on
 * Mojolicious/Xslate (`#2911`, a boolean item field) because `items` is a
 * component-scope LOCAL const. A prop-derived array skips static-bake
 * analysis entirely on every adapter (each renders its normal runtime loop
 * instead), so moving `items` to a prop escapes both refusal families with
 * full SSR.
 */
export const fixture = createFixture({
  id: 'static-loop-item-boolean-attr-precomputed',
  description: 'prop-precompute twin of static-loop-item-boolean-attr — items moved to a prop, full SSR (#2898, #2911)',
  source: `
type Item = { id: number; label: string; disabled: boolean }

export function StaticLoopItemBooleanAttrPrecomputed(props: { items: Item[] }) {
  return (
    <ul>
      {props.items.map(item => (
        <li key={item.id}>
          <button type="button" disabled={item.disabled}>{item.label}</button>
        </li>
      ))}
    </ul>
  )
}
`,
  props: {
    items: [
      { id: 1, label: 'Alpha', disabled: true },
      { id: 2, label: 'Beta', disabled: false },
    ],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="1"><button bf="s1" disabled type="button"><!--bf:s0-->Alpha<!--/--></button></li>
      <li data-key="2"><button bf="s1" type="button"><!--bf:s0-->Beta<!--/--></button></li>
    </ul>
  `,
})
