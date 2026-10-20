import { createFixture } from '../src/types'

/**
 * A signal seeded by a `??` whose fallback reads another prop
 * (`createSignal(props.b ?? props.a)`). When `b` is omitted or `null` the
 * seed falls through to `a`; when both are absent the seed is `undefined`,
 * so the attribute is omitted and the text is empty. A three-operand chain
 * ending in a literal and a number pair (a fraction on the fallback side)
 * take the same path. Each signal is read in an attribute and in text.
 */
export const fixture = createFixture({
  id: 'signal-seed-prop-nullish-prop-fallback',
  description: 'a signal seeded by `props.b ?? props.a` falls through to `a` when `b` is omitted or null (#3577)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function SignalSeedPropNullishPropFallback(props: { a?: string; b?: string; c?: string; m?: number; n?: number }) {
  const [s] = createSignal(props.b ?? props.a)
  const [t] = createSignal(props.c ?? props.b ?? 'z')
  const [k] = createSignal(props.n ?? props.m)
  return (
    <p data-s={s()} data-t={t()} data-k={k()}>
      <span>{s()}</span>
      <span>{t()}</span>
      <span>{k()}</span>
    </p>
  )
}
`,
  props: { a: 'A', b: 'B', m: 1.5, n: 2 },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-k="2" data-s="B" data-t="B">
      <span bf="s1"><!--bf:s0-->B<!--/--></span>
      <span bf="s3"><!--bf:s2-->B<!--/--></span>
      <span bf="s5"><!--bf:s4-->2<!--/--></span>
    </p>
  `,
  dataPoints: [
    { name: 'only-a', props: { a: 'A', m: 1.5 } },
    { name: 'b-null', props: { a: 'A', b: null, m: 1.5, n: null } },
    { name: 'only-b', props: { b: 'B', n: 2 } },
    { name: 'b-empty', props: { a: 'A', b: '', m: 1.5, n: 0 } },
    { name: 'only-c', props: { c: 'C' } },
    { name: 'neither', props: {} },
  ],
})
