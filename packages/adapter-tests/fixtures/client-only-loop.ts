import { createFixture } from '../src/types'

// Minimal clientOnly-loop shape (#2066): a bare `/* @client */ items().map()`
// with no filter chain or sibling nodes. SSR renders no items, but every
// adapter must still emit the `loop:`/`/loop:` boundary marker pair so the
// client runtime's mapArray() can locate its insertion anchor at hydration
// time (#872; per-call-site marker ids per #1087). The pair contract itself
// is enforced cross-adapter by the marker-conformance suite (start AND end
// marker sets both match the IR's loop ids); this fixture exists so that
// contract has a dedicated minimal shape not entangled with `client-only`'s
// filter chain or `client-only-loop-with-sibling-cond`'s sibling markers.
export const fixture = createFixture({
  id: 'client-only-loop',
  description: 'Client-only directive suppresses SSR for a bare loop, keeping boundary markers',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ClientOnlyLoop() {
  const [items, setItems] = createSignal<string[]>([])
  return (
    <ul>
      {/* @client */ items().map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1"></ul>
  `,
})
