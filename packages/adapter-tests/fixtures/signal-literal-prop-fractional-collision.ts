import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-literal-prop-fractional-collision',
  description: 'Independent signal and prop numeric memos preserve fractional arithmetic',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function SignalLiteralPropFractionalCollision(props: { count: number }) {
  const [count] = createSignal(1.5)
  const total = createMemo(() => count() + props.count)
  const totalAlias = total
  const difference = createMemo(() => count() - props.count)
  const product = createMemo(() => props.count * count())
  return <div><span>{total()}</span><span>{difference()}</span><span>{product()}</span><span>{\`total: \${total()}, alias: \${totalAlias()}\`}</span></div>
}
`,
  props: { count: 2 },
  dataPoints: [
    { name: 'zero', props: { count: 0 } },
    { name: 'negative', props: { count: -1 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->3.5<!--/--></span>
      <span bf="s3"><!--bf:s2-->-0.5<!--/--></span>
      <span bf="s5"><!--bf:s4-->3<!--/--></span>
      <span bf="s7"><!--bf:s6-->total: 3.5, alias: 3.5<!--/--></span>
    </div>
  `,
})
