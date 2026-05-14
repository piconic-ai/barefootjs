import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-with-fallback',
  description: 'Signal initialized with props fallback via ??',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalWithFallback(props: { initial?: number }) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  return <div>{count()}</div>
}
`,
  props: { initial: 5 },
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf:s0-->5<!--/--></div>
  `,
})
