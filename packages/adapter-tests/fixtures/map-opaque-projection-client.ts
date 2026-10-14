import { createFixture } from '../src/types'

/**
 * `map-opaque-projection` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'map-opaque-projection-client',
  description: 'A `.map()` projection calling an unlowered method, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MapOpaqueProjectionClient() {
  const [items, setItems] = createSignal<string[]>(['a', 'z'])
  return <p>{/* @client */ items().map(x => x.localeCompare('m')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
