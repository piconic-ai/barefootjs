import { createFixture } from '../src/types'

/**
 * `memo-prop-read-beside-signal-nullish-seed` with destructured props: memos
 * read `b` / `n` raw (bare, `n * 2`, `n / 2`, `n + 1`, an identity memo over
 * the bare one) beside signals seeded by `b ?? 'y'` / `n ?? 3`. Each memo
 * sees the prop itself, in an attribute, text, a ternary, an `&&` and a
 * child prop: an omitted prop is `undefined`, so the arithmetic is `NaN`.
 */
export const fixture = createFixture({
  id: 'memo-prop-read-beside-signal-nullish-seed-destructured',
  description: 'memos reading destructured props raw do not take a sibling signal seed’s `??` fallback',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Shown(props: { v?: unknown }) {
  return <i>{props.v}</i>
}

export function MemoPropReadBesideSignalNullishSeedDestructured({ b, n }: { b?: string; n?: number }) {
  const [s] = createSignal(b ?? 'y')
  const [k] = createSignal(n ?? 3)
  const bare = createMemo(() => b)
  const same = createMemo(() => bare())
  const twice = createMemo(() => n * 2)
  const half = createMemo(() => n / 2)
  const plus = createMemo(() => n + 1)
  return (
    <p data-s={s()} data-k={k()} data-twice={twice()} data-half={half()} data-plus={plus()}>
      {same()}
      {bare() ? <b>{bare()}</b> : <u>none</u>}
      {bare() && <em>{plus()}</em>}
      <Shown v={twice()} />
    </p>
  )
}
`,
  props: { b: 'B', n: 2 },
  expectedHtml: `
    <p bf-s="test" bf="s8" data-half="1" data-k="2" data-plus="3" data-s="B" data-twice="4">
      <!--bf:s0-->B<!--/-->
      <b bf-c="s1" bf="s3"><!--bf:s2-->B<!--/--></b>
      <em bf-c="s4" bf="s6"><!--bf:s5-->3<!--/--></em>
      <i bf-s="test_s7" bf="s1"><!--bf:s0-->4<!--/--></i>
    </p>
  `,
  dataPoints: [
    { name: 'omitted', props: {} },
    { name: 'zero-empty', props: { b: '', n: 0 } },
    { name: 'fraction', props: { b: 'B', n: 2.5 } },
  ],
})
