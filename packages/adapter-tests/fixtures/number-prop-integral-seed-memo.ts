import { createFixture } from '../src/types'

/**
 * The integer twin of `number-prop-fraction-seed-memo`: the same `?? 2`
 * seed and derived memo with an integer caller value. JS prints an
 * integral double without a fraction (`3`, `9`), so an engine that holds
 * every `number` as a double must not print `3.0` or `9.0`.
 */
export const fixture = createFixture({
  id: 'number-prop-integral-seed-memo',
  description: 'An integral number prop through a `?? 2` seed and a derived memo prints without a fraction (3, 9)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function NumberPropIntegralSeedMemo(props: { b?: number }) {
  const [v] = createSignal(props.b ?? 2)
  const tripled = createMemo(() => v() * 3)
  return (
    <p data-v={v()} data-t={tripled()}>
      <span>{v()}</span>
      <span>{tripled()}</span>
    </p>
  )
}
`,
  props: { b: 3 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-t="9" data-v="3">
      <span bf="s1"><!--bf:s0-->3<!--/--></span>
      <span bf="s3"><!--bf:s2-->9<!--/--></span>
    </p>
  `,
})
