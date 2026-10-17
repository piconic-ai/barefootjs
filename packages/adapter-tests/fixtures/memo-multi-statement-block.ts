import { createFixture } from '../src/types'

/**
 * Memos whose body is more than one statement: a local followed by a
 * `return`, and an early `return` guard. Their value is a call of the whole
 * callback, which the SSR seed plan used to leave `opaque`, so the template
 * adapters that seed memos in-template rendered them empty. They now seed
 * from the analyzer's fold of the statements into one expression (#3523).
 */
export const fixture = createFixture({
  id: 'memo-multi-statement-block',
  description: 'A memo with a multi-statement block body renders its value on the seeding template adapters',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MultiStatementMemo(props: { label?: string }) {
  const [count, setCount] = createSignal(2)
  const tripled = createMemo(() => {
    const k = count()
    return k * 3
  })
  const shown = createMemo(() => {
    if (!props.label) return 'none'
    return props.label
  })
  return (
    <button onClick={() => setCount(count() + 1)}>
      <span>{tripled()}</span>
      <span>{shown()}</span>
    </button>
  )
}
`,
  props: {},
  expectedHtml: `
    <div></div>
  `,
  dataPoints: [
    { name: 'label-given', props: { label: 'Given' } },
  ],
})
