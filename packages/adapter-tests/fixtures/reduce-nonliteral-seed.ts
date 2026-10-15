import { createFixture } from '../src/types'

/**
 * A `.reduce()` seeded with a non-literal value. The evaluator folds from a
 * string or number literal only.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'reduce-nonliteral-seed',
  description: 'A `.reduce()` seeded with a non-literal value — DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ReduceNonliteralSeed() {
  const [items, setItems] = createSignal<number[]>([1, 2])
  const [start, setStart] = createSignal(10)
  return <p>{items().reduce((acc, x) => acc + x, start())}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->13<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'reduce-nonliteral-seed-client' }],
})
