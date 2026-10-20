import { createFixture } from '../src/types'

/**
 * A signal seeded by `b ?? 'x'` where `b`'s destructure default reads an
 * earlier prop (`{ a = 'a', b = a }`), beside a signal seeded by `c ?? 'y'`
 * over a plain optional prop and a memo over that signal. The first seed is
 * evaluated over the defaulted `b`; the second reads its own fallback, as
 * does the memo, and the bare `c` read stays the prop.
 */
export const fixture = createFixture({
  id: 'signal-seed-dependent-default-nullish-literal',
  description: 'a `b ?? lit` signal seed over a dependent destructure default beside a `c ?? lit` seed read through a memo',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function SignalSeedDependentDefaultNullishLiteral({ a = 'a', b = a, c }: { a?: string; b?: string; c?: string }) {
  const [s] = createSignal(b ?? 'x')
  const [t] = createSignal(c ?? 'y')
  const marked = createMemo(() => t() + '!')
  return (
    <p data-s={s()} data-t={t()} data-c={c}>
      <span>{s()}</span>
      <span>{marked()}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s4" data-s="a" data-t="y">
      <span bf="s1"><!--bf:s0-->a<!--/--></span>
      <span bf="s3"><!--bf:s2-->y!<!--/--></span>
    </p>
  `,
  dataPoints: [
    { name: 'a-only', props: { a: 'A' } },
    { name: 'b-only', props: { b: 'B' } },
    { name: 'c-only', props: { c: 'C' } },
    { name: 'all', props: { a: 'A', b: 'B', c: 'C' } },
  ],
})
