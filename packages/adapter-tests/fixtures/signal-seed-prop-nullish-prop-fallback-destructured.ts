import { createFixture } from '../src/types'

/**
 * `signal-seed-prop-nullish-prop-fallback` with destructured props
 * (`createSignal(b ?? a)`), and the seeded signal read through a memo that
 * applies its own fallback. Beside it, `b ?? 'h'` seeds another signal and
 * `createSignal(b)` reads `b` bare: the bare seed, read through a memo, is
 * the prop itself, not the `'h'` fallback.
 */
export const fixture = createFixture({
  id: 'signal-seed-prop-nullish-prop-fallback-destructured',
  description: 'a signal seeded by `b ?? a` over destructured props falls through to `a`, read directly and through a memo (#3577)',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function SignalSeedPropNullishPropFallbackDestructured({ a, b, m, n }: { a?: string; b?: string; m?: number; n?: number }) {
  const [s] = createSignal(b ?? a)
  const [k] = createSignal(n ?? m)
  const [h] = createSignal(b ?? 'h')
  const [raw] = createSignal(b)
  const shown = createMemo(() => s() ?? 'none')
  const rawShown = createMemo(() => raw() ?? 'none')
  return (
    <p data-s={s()} data-k={k()} data-h={h()} data-shown={shown()} data-raw-shown={rawShown()}>
      <span>{s()}</span>
      <span>{shown()}</span>
    </p>
  )
}
`,
  props: { a: 'A', b: 'B', m: 1.5, n: 2 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-h="B" data-k="2" data-raw-shown="B" data-s="B" data-shown="B">
      <span bf="s1"><!--bf:s0-->B<!--/--></span>
      <span bf="s3"><!--bf:s2-->B<!--/--></span>
    </p>
  `,
  dataPoints: [
    { name: 'only-a', props: { a: 'A', m: 1.5 } },
    { name: 'b-null', props: { a: 'A', b: null, m: 1.5, n: null } },
    { name: 'neither', props: {} },
  ],
})
