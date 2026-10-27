import { createFixture } from '../src/types'

/**
 * Memos that read a prop raw (`createMemo(() => props.b)`,
 * `createMemo(() => props.n * 2)`) beside a signal seeded by
 * `props.b ?? 'y'` / `props.n ?? 3`. The memos see the prop itself: when it
 * is omitted the bare memo is `undefined` (its text is empty) and
 * the arithmetic is `NaN`; the signal's fallback applies only to the signal.
 */
export const fixture = createFixture({
  id: 'memo-prop-read-beside-signal-nullish-seed',
  description: 'a memo reading a prop raw does not take a sibling signal seed’s `??` fallback',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function MemoPropReadBesideSignalNullishSeed(props: { b?: string; n?: number }) {
  const [s] = createSignal(props.b ?? 'y')
  const [k] = createSignal(props.n ?? 3)
  const bare = createMemo(() => props.b)
  const twice = createMemo(() => props.n * 2)
  return <p data-s={s()} data-k={k()} data-twice={twice()}>{bare()}</p>
}
`,
  props: { b: 'B', n: 2 },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-k="2" data-s="B" data-twice="4"><!--bf:s0-->B<!--/--></p>
  `,
  dataPoints: [
    { name: 'omitted', props: {} },
    { name: 'zero-empty', props: { b: '', n: 0 } },
    { name: 'fraction', props: { b: 'B', n: 2.5 } },
  ],
})
