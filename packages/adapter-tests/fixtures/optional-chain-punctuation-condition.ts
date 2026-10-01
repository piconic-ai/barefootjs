import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-chain-punctuation-condition',
  description: 'Optional computed members retain punctuation keys in conditions and text',
  source: `
'use client'
type Props = { meta?: { 'data-x': number; "it's": number } }
export function OptionalChainPunctuationCondition(props: Props) {
  return <div>
    <span>{(props.meta?.['data-x'] ?? 0) > 0 ? 'has' : 'none'}</span>
    <span>{props.meta?.['data-x'] ?? 0}</span>
    <span>{props.meta?.["it's"] ?? 0}</span>
  </div>
}
`,
  props: { meta: { 'data-x': 2, "it's": 3 } },
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'zero', props: { meta: { 'data-x': 0, "it's": 0 } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf-cond-start:s0-->has<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf:s2-->2<!--/--></span>
      <span bf="s5"><!--bf:s4-->3<!--/--></span>
    </div>
  `,
})
