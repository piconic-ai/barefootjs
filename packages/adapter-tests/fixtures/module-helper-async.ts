import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'module-helper-async',
  description:
    'Module-level async helper called from a component (#2986) — the helper\'s own `await` must not leak into a non-async scope',
  source: `
'use client'
import { createSignal, onMount } from '@barefootjs/client'

const loadData = async (): Promise<string[]> => {
  const res = await fetch('/data.json')
  return res.json()
}

export function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
`,
  expectedHtml: `
    <div bf-s="test">0</div>
  `,
})
