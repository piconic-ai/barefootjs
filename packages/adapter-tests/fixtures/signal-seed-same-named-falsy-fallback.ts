import { createFixture } from '../src/types'

/**
 * Same-named signals and memos whose seed falls back from their own prop,
 * handed a falsy value: `||` replaces a supplied `0` / `''` while `??`
 * keeps it (`n` is optional, so an absent prop and a supplied `0` stay
 * distinct on every backend). Each binding renders its initializer's result: `props.count ||
 * 7` is `7` for `count={0}`, `props.n ?? 5` stays `0`, `props.tag ||
 * 'dflt'` is `dflt` for `tag=""`, and `props.label ?? 'x'` is `x` only
 * when the prop is absent.
 */
export const fixture = createFixture({
  id: 'signal-seed-same-named-falsy-fallback',
  description: 'A same-named signal or memo falling back with `||` or `??` keeps its fallback semantics for falsy props',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedSameNamedFalsyFallback(props: { count: number; n?: number; tag: string; label?: string }) {
  const [count] = createSignal(props.count || 7)
  const [n] = createSignal(props.n ?? 5)
  const tag = createMemo(() => props.tag || 'dflt')
  const [label] = createSignal(props.label ?? 'x')
  return <p data-tag={tag()}>{count()}|{n()}|{tag()}|{label()}</p>
}
`,
  props: { count: 0, n: 0, tag: '' },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-tag="dflt"><!--bf:s0-->7<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->dflt<!--/-->|<!--bf:s3-->x<!--/--></p>
  `,
  dataPoints: [
    { name: 'truthy', props: { count: 3, n: 4, tag: 't', label: 'L' } },
    { name: 'empty-label', props: { count: 0, n: 0, tag: '', label: '' } },
  ],
})
