import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-chain-computed-condition',
  description: 'Optional computed members retain numeric indices and punctuation in conditions and text',
  source: `
'use client'
type Props = { items?: number[]; meta?: { 'data-x': number } }
export function OptionalChainComputedCondition(props: Props) {
  return <div>
    <span>{(props.items?.[0] ?? 0) > 0 ? 'has' : 'none'}</span>
    <span>{props.items?.[0] ?? 0}</span>
    <span>{(props.meta?.['data-x'] ?? 0) > 0 ? 'has' : 'none'}</span>
    <span>{props.meta?.['data-x'] ?? 0}</span>
  </div>
}
`,
  props: { items: [2], meta: { 'data-x': 2 } },
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'zero', props: { items: [0], meta: { 'data-x': 0 } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf-cond-start:s0-->has<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf:s2-->2<!--/--></span>
      <span bf="s5"><!--bf-cond-start:s4-->has<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf:s6-->2<!--/--></span>
    </div>
  `,
})
