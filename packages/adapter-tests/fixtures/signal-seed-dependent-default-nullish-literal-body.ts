import { createFixture } from '../src/types'

/**
 * `signal-seed-dependent-default-nullish-literal` with the defaults in a
 * body destructure of the props object (`const { a = 'a', b = a } =
 * props`), and the second seed reading the props object
 * (`props.c ?? 'y'`).
 */
export const fixture = createFixture({
  id: 'signal-seed-dependent-default-nullish-literal-body',
  description: 'a `b ?? lit` signal seed over a body-destructured dependent default beside a `props.c ?? lit` seed read through a memo',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'

export function SignalSeedDependentDefaultNullishLiteralBody(props: { a?: string; b?: string; c?: string }) {
  const { a = 'a', b = a } = props
  const [s] = createSignal(b ?? 'x')
  const [t] = createSignal(props.c ?? 'y')
  const marked = createMemo(() => t() + '!')
  return (
    <p data-s={s()} data-t={t()} data-c={props.c}>
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
  ],
})
