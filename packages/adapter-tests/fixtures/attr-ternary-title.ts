import { createFixture } from '../src/types'

/**
 * A ternary in a NON-class attribute position (`title`). The class
 * ternary is pinned by `conditional-class`; this generalizes the
 * same lowering to an arbitrary attribute plus a second binding whose
 * branches are numeric.
 */
export const fixture = createFixture({
  id: 'attr-ternary-title',
  description: 'Ternary expressions in title and data attribute positions',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function AttrTernaryTitle() {
  const [active, setActive] = createSignal(false)
  return (
    <button title={active() ? 'turn off' : 'turn on'} data-step={active() ? 2 : 1}>
      toggle
    </button>
  )
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0" data-step="1" title="turn on"> toggle </button>
  `,
})
