import { createFixture } from '../src/types'

/**
 * Keying a loop by the map INDEX (`key={i}`) while the body renders
 * the item — index-as-key is the most common escape hatch in real
 * code. `map-with-index` pins index-in-body; this pins index-in-key.
 */
export const fixture = createFixture({
  id: 'map-key-index',
  description: 'Loop keyed by map index rather than an item field',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MapKeyIndex() {
  const [steps, setSteps] = createSignal(['unpack', 'plug in', 'enjoy'])
  return (
    <ol>
      {steps().map((step, i) => (
        <li key={i}>{step}</li>
      ))}
    </ol>
  )
}
`,
  expectedHtml: `
    <ol bf-s="test" bf="s1">
      <li data-key="0"><!--bf:s0-->unpack<!--/--></li>
      <li data-key="1"><!--bf:s0-->plug in<!--/--></li>
      <li data-key="2"><!--bf:s0-->enjoy<!--/--></li>
    </ol>
  `,
})
