import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-literal-prop-scalar-collision',
  description: 'A literal-seeded scalar signal and same-named prop stay independent in values and a derived memo',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function SignalLiteralPropScalarCollision(props: { count: number }) {
  const [count, setCount] = createSignal(7)
  const alias = count
  const total = createMemo(() => count() + props.count)
  const difference = createMemo(() => props.count - count())
  const product = createMemo(() => count() * props.count)
  return <div>
    <span>{props.count}</span>
    <span>{count()}</span>
    <span>{alias()}</span>
    <span>{total()}</span>
    <span>{difference()}</span>
    <span>{product()}</span>
    <button onClick={() => setCount(count() + 1)}>{count() > props.count ? 'higher' : 'lower'}</button>
  </div>
}
`,
  props: { count: 2 },
  dataPoints: [
    { name: 'zero', props: { count: 0 } },
    { name: 'higher-prop', props: { count: 9 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->2<!--/--></span>
      <span bf="s3"><!--bf:s2-->7<!--/--></span>
      <span bf="s5"><!--bf:s4-->7<!--/--></span>
      <span bf="s7"><!--bf:s6-->9<!--/--></span>
      <span bf="s9"><!--bf:s8-->-5<!--/--></span>
      <span bf="s11"><!--bf:s10-->14<!--/--></span>
      <button bf="s13"><!--bf-cond-start:s12-->higher<!--bf-cond-end:s12--></button>
    </div>
  `,
})
