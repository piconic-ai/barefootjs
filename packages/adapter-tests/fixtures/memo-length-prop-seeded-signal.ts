import { createFixture } from '../src/types'

/**
 * A memo reading `.length` of a signal seeded from an array prop renders the
 * array's length at SSR. The `createQuery` value twin is
 * `create-query-derived-memo`; this is the minimal `createSignal` form of the
 * same shape.
 */
export const fixture = createFixture({
  id: 'memo-length-prop-seeded-signal',
  description: 'A memo over the length of a prop-seeded array signal renders the length at SSR',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

export function ItemCount(props: { items: string[] }) {
  const [items] = createSignal(props.items)
  const count = createMemo(() => items().length)
  return <p>{count()} items</p>
}
`,
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--> items</p>
  `,
})
