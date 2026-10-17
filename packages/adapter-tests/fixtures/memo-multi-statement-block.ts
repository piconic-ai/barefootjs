import { createFixture } from '../src/types'

/**
 * Memos whose body is more than one statement: a local followed by a
 * `return`, and an early `return` guard. Their value is a call of the whole
 * callback, which the SSR seed plan used to leave `opaque`, so the template
 * adapters that seed memos in-template rendered them empty. They now seed
 * from the analyzer's fold of the statements into one expression (#3523).
 * Go Template typed such a memo from the block's text, where `{` reads as
 * an object, and rendered `map[]`; the type now comes from the fold too
 * (`k ?? false` is not typed by its fallback, so it renders `2`).
 */
export const fixture = createFixture({
  id: 'memo-multi-statement-block',
  description: 'A memo with a multi-statement block body renders its value on the seeding template adapters',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MultiStatementMemo({ label }: { label?: string }) {
  const [count, setCount] = createSignal(2)
  const tripled = createMemo(() => {
    const k = count()
    return k * 3
  })
  const shown = createMemo(() => {
    if (!label) return 'none'
    return label
  })
  const size = createMemo(() => {
    if (count() > 5) return 'big'
    return 'small'
  })
  const settled = createMemo(() => {
    const k = count()
    return k ?? false
  })
  return (
    <button onClick={() => setCount(count() + 1)}>
      <span>{tripled()}</span>
      <span>{shown()}</span>
      <span>{size()}</span>
      <span>{settled()}</span>
    </button>
  )
}
`,
  props: {},
  expectedHtml: `
    <button bf-s="test" bf="s8">
      <span bf="s1"><!--bf:s0-->6<!--/--></span>
      <span bf="s3"><!--bf:s2-->none<!--/--></span>
      <span bf="s5"><!--bf:s4-->small<!--/--></span>
      <span bf="s7"><!--bf:s6-->2<!--/--></span>
    </button>
  `,
  dataPoints: [
    { name: 'label-given', props: { label: 'Given' } },
  ],
})
