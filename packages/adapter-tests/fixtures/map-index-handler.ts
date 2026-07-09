import { createFixture } from '../src/types'

/**
 * A list-item click handler that closes over the `.map()` index param (#2189).
 * Pins that a keyed loop whose delegated handler reads the index compiles and
 * renders consistently across adapters and CSR. The index-binding runtime
 * behavior is exercised in the client e2e test.
 */
export const fixture = createFixture({
  id: 'map-index-handler',
  description: 'List-item click handler reading the map index param',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MapIndexHandler() {
  const [items] = createSignal([
    { id: 10, label: 'a' },
    { id: 20, label: 'b' },
  ])
  const [, setActive] = createSignal(0)
  return (
    <ul>
      {items().map((item, i) => (
        <li key={item.id}>
          <button onClick={() => setActive(i)}>{item.label}</button>
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2">
      <li data-key="10"><button bf="s1"><!--bf:s0-->a<!--/--></button></li>
      <li data-key="20"><button bf="s1"><!--bf:s0-->b<!--/--></button></li>
    </ul>
  `,
})
