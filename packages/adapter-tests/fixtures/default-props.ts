import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'default-props',
  description: 'Props with fallback defaults via ?? in signal initialization',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DefaultProps(props: { label?: string; size?: number }) {
  const [currentLabel, setCurrentLabel] = createSignal(props.label ?? 'Default')
  const [count, setCount] = createSignal(props.size ?? 1)
  return <div><span>{currentLabel()}</span><span>{count()}</span></div>
}
`,
  props: { label: 'Custom', size: 5 },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Custom<!--/--></span>
      <span bf="s3"><!--bf:s2-->5<!--/--></span>
    </div>
  `,
})
