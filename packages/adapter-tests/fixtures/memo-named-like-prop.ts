import { createFixture } from '../src/types'

/**
 * Memos named like props of a bare-props component: an identity memo
 * `count` over a signal, then `label`, arithmetic over that memo. Each
 * memo is a different value from the same-named prop (`props.count`,
 * `props.label`), so the template must keep them apart.
 */
export const fixture = createFixture({
  id: 'memo-named-like-prop',
  description: 'Memos named like other props read the memos, not the props',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoNamedLikeProp(props: { label?: string; count?: number; b?: number }) {
  const [seed] = createSignal(props.b ?? 2)
  const count = createMemo(() => seed())
  const label = createMemo(() => count() * 3)
  return <p data-c={count()} data-l={label()}>{label()} / {props.label} / {props.count}</p>
}
`,
  props: { label: 'P', count: 5, b: 4 },
  dataPoints: [
    { name: 'props-only', props: { label: 'P', count: 5 } },
    { name: 'seed-only', props: { b: 4 } },
    { name: 'zero', props: { count: 0, b: 0 } },
    { name: 'neither', props: {} },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s3" data-c="4" data-l="12"><!--bf:s0-->12<!--/--> / <!--bf:s1-->P<!--/--> / <!--bf:s2-->5<!--/--></p>
  `,
})
