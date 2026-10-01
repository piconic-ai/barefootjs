import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'optional-chain-numeric-key-condition',
  description: 'Optional computed numeric keys distinguish array indices from object keys',
  source: `
'use client'
type Props = { items?: number[]; meta?: { '0': number; '01': number } }
export function OptionalChainNumericKeyCondition(props: Props) {
  return <div>
    <span>{props.items?.['0'] ?? 0}</span>
    <span>{(props.meta?.[0] ?? 0) > 0 ? 'has' : 'none'}</span>
    <span>{props.meta?.['0'] ?? 0}</span>
    <span>{props.meta?.['01'] ?? 0}</span>
    <span>{props.items?.['01'] ?? 0}</span>
    <span>{props.items?.[''] ?? 0}</span>
    <span>{props.items?.['-1'] ?? 0}</span>
  </div>
}
`,
  props: { items: [2, 7], meta: { '0': 3, '01': 4 } },
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'zero', props: { items: [0, 7], meta: { '0': 0, '01': 0 } } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->2<!--/--></span>
      <span bf="s3"><!--bf-cond-start:s2-->has<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf:s4-->3<!--/--></span>
      <span bf="s7"><!--bf:s6-->4<!--/--></span>
      <span bf="s9"><!--bf:s8-->0<!--/--></span>
      <span bf="s11"><!--bf:s10-->0<!--/--></span>
      <span bf="s13"><!--bf:s12-->0<!--/--></span>
    </div>
  `,
})
