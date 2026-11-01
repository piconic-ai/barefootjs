import { createFixture } from '../src/types'

/**
 * A reducer parameter that shares its name with an optional nullable prop
 * (`n?: number | null`) reads the array element, not the prop, so the
 * arithmetic on it is neither refused nor coerced as the prop would be.
 */
export const fixture = createFixture({
  id: 'memo-reduce-param-shadows-nullable-prop',
  description: 'A `.reduce` memo whose callback parameter shadows an optional nullable prop folds the array elements',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function MemoReduceParamShadowsNullableProp({ items, n }: { items: number[]; n?: number | null }) {
  const total = createMemo(() => items.reduce((acc, n) => acc + n * 2, 0))
  return <p data-n={n ?? 'none'}>{total()}</p>
}
`,
  props: { items: [1, 2.5, 4] },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-n="none"><!--bf:s0-->15<!--/--></p>
  `,
})
