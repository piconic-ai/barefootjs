import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nullish-coalescing-text',
  description: 'Nullish coalescing (??) in text content renders correctly',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function NullishCoalescingText(props: { label?: string; size?: number }) {
  const [count, setCount] = createSignal(props.size ?? 1)
  return <div><span>{props.label ?? 'Default'}</span><span>{count()}</span></div>
}
`,
  props: { label: 'Custom', size: 5 },
  // Oracle conformance pilot (spec/subset-conformance.md, roadmap 1).
  // `??` is the classic divergence surface: '' and 0 are nullish-KEPT
  // in JS (unlike `||`), which a backend lowering that models optional
  // props as zero-values cannot distinguish from "absent".
  dataPoints: [
    { name: 'both-absent', props: {} },
    { name: 'empty-label', props: { label: '' } },
    { name: 'zero-size', props: { size: 0 } },
    { name: 'html-in-label', props: { label: '<b>&"quote' } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->Custom<!--/--></span>
      <span bf="s3"><!--bf:s2-->5<!--/--></span>
    </div>
  `,
})
