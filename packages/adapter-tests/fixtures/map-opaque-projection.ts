import { createFixture } from '../src/types'

/**
 * A `.map()` projection calling a method no template lowers (`localeCompare`).
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'map-opaque-projection',
  description: 'A `.map()` projection calling an unlowered method — DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MapOpaqueProjection() {
  const [items, setItems] = createSignal<string[]>(['a', 'z'])
  return <p>{items().map(x => x.localeCompare('m')).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->-1,1<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'map-opaque-projection-client' }],
})
