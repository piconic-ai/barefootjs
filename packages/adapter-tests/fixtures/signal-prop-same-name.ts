import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'signal-prop-same-name',
  description: 'Signal initialized from prop with identical name',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SignalPropSameName(props: { label?: string }) {
  const [label, setLabel] = createSignal(props.label ?? 'Default')
  return <span>{label()}</span>
}
`,
  props: { label: 'Hello' },
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->Hello<!--/--></span>
  `,
})
