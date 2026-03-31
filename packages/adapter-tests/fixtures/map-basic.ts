import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'map-basic',
  description: 'Basic keyed array map rendering',
  source: `
'use client'
import { createSignal } from '@barefootjs/dom'
type Item = { name: string }
export function MapBasic() {
  const [items, setItems] = createSignal<Item[]>([])
  return <ul>{items().map(item => <li key={item.name}>{item.name}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s0"></ul>
  `,
})
