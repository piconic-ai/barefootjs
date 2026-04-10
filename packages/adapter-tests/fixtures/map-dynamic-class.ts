import { createFixture } from '../src/types'

/**
 * Tests loop root element with dynamic className depending on loop param.
 * The root element must get a slotId so reactive attr effects are generated.
 */
export const fixture = createFixture({
  id: 'map-dynamic-class',
  description: 'Loop items with dynamic className from loop param',
  source: `
'use client'
import { createSignal } from '@barefootjs/dom'
type Item = { id: number; active: boolean; label: string }
export function MapDynamicClass() {
  const [items, setItems] = createSignal<Item[]>([])
  return (
    <ul>
      {items().map(item => (
        <li key={item.id} className={item.active ? 'active' : 'inactive'}>{item.label}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2"></ul>
  `,
})
