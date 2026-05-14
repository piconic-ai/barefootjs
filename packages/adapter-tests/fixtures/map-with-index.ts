import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'map-with-index',
  description: 'Array map with index parameter',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Entry = { label: string }
export function MapWithIndex() {
  const [entries, setEntries] = createSignal<Entry[]>([])
  return <ul>{entries().map((entry, i) => <li key={i}>{i}: {entry.label}</li>)}</ul>
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s2"></ul>
  `,
})
