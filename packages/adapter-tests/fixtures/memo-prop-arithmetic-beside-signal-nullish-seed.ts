import { createFixture } from '../src/types'

/**
 * Memos over `props.n` / `props.f` beside signals seeded by
 * `props.n ?? 3`, `props.b ?? 'y'` and
 * `props.f ?? true`: division, addition, a memo chain over the division and
 * `props.f ?? false`. Each reads the prop itself, so an omitted prop is
 * `undefined` (`NaN`, `false`) and the signals alone take the fallbacks.
 */
export const fixture = createFixture({
  id: 'memo-prop-arithmetic-beside-signal-nullish-seed',
  description: 'memos over a prop (arithmetic, `?? false`) do not take a sibling signal seed’s `??` fallback',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

function Shown(props: { v?: unknown }) {
  return <i>{props.v}</i>
}

export function MemoPropArithmeticBesideSignalNullishSeed(props: { b?: string; n?: number; f?: boolean }) {
  const [k] = createSignal(props.n ?? 3)
  const [s] = createSignal(props.b ?? 'y')
  const [on] = createSignal(props.f ?? true)
  const half = createMemo(() => props.n / 2)
  const plus = createMemo(() => props.n + 1)
  const chain = createMemo(() => half() + 1)
  const flag = createMemo(() => props.f ?? false)
  return (
    <div data-k={k()} data-s={s()} data-on={String(on())} data-half={half()} data-plus={plus()} data-chain={chain()} data-flag={String(flag())}>
      {half()}
      {flag() ? <b>on</b> : <u>off</u>}
      <Shown v={plus()} />
    </div>
  )
}
`,
  props: { b: 'B', n: 2, f: true },
  expectedHtml: `
    <div bf-s="test" bf="s3" data-chain="2" data-flag="true" data-half="1" data-k="2" data-on="true" data-plus="3" data-s="B">
      <!--bf:s0-->1<!--/-->
      <b bf-c="s1">on</b>
      <i bf-s="test_s2" bf="s1"><!--bf:s0-->3<!--/--></i>
    </div>
  `,
  dataPoints: [
    { name: 'omitted', props: {} },
    { name: 'zero-empty-false', props: { b: '', n: 0, f: false } },
    { name: 'fraction', props: { b: 'B', n: 2.5, f: true } },
  ],
})
