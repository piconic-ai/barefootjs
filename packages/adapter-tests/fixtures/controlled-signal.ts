import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'controlled-signal',
  description: 'Signal initialized directly from props value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ControlledSignal(props: { value: number }) {
  const [val, setVal] = createSignal(props.value)
  return <span>{val()}</span>
}
`,
  props: { value: 42 },
  expectedHtml: `
    <span bf-s="test" bf="s1"><!--bf:s0-->42<!--/--></span>
  `,
})
