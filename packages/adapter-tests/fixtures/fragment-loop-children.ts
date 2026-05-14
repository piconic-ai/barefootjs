import { createFixture } from '../src/types'

/**
 * Multi-root Fragment as a `.map(...)` body (#1212).
 *
 * Each item returns `<><path data-hit-id/><path data-id/></>` — a JSX
 * Fragment with two sibling root elements. mapArray's per-key DOM
 * tracking would otherwise pair `existingChildren[i]` with `items[i]`,
 * walking the hit/visible pair off by one slot per key. The fix emits
 * per-item `<!--bf-loop-i-->` markers and a multi-root template clone so
 * each key tracks both `<path>`s as one logical unit.
 *
 * Empty initial array keeps the SSR shape contract focused on the loop
 * boundary marker pair (the per-item marker only appears once an item
 * renders). Runtime regression is exercised end-to-end by
 * `packages/client/__tests__/runtime/map-array-multi-root.test.ts`.
 */
export const fixture = createFixture({
  id: 'fragment-loop-children',
  description: 'Multi-root Fragment loop body — hit/visible <path> pair per item (#1212)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Edge = { id: string }
export function Edges() {
  const [edges, setEdges] = createSignal<Edge[]>([])
  return (
    <svg>
      {edges().map((edge) => (
        <>
          <path key={edge.id} data-hit-id={edge.id} stroke="transparent" stroke-width="20" />
          <path data-id={edge.id} fill="none" />
        </>
      ))}
    </svg>
  )
}
`,
  expectedHtml: `
    <svg bf-s="test" bf="s2"></svg>
  `,
})
