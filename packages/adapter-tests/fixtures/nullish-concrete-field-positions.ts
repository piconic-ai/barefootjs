import { createFixture } from '../src/types'

/**
 * `??` over a required (never nullish) prop yields the prop itself, even
 * when it is falsy (`false`, `''`, `0`): in an attribute, a text child, a
 * template literal, a ternary branch, an `&&` operand, a loop row, a
 * child prop and a memo. A truthiness-based `or` would take the fallback.
 */
export const fixture = createFixture({
  id: 'nullish-concrete-field-positions',
  description: '?? over a required falsy prop keeps the prop value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
import { Label } from './label'
export function NullishConcreteFieldPositions(props: { flag: boolean; label: string; count: number; on: boolean; items: string[] }) {
  const shown = createMemo(() => props.label ?? 'none')
  return (
    <div data-m={shown()} data-flag={props.flag ?? 'none'} data-label={props.label ?? 'none'} data-count={props.count ?? 9} data-tpl={\`\${props.flag ?? 'none'}|\${props.label ?? 'none'}|\${props.count ?? 9}\`} data-cat={'v=' + (props.count ?? 9)}>
      <span>{props.label ?? 'none'}</span>
      <b>{shown()}</b>
      <span>{props.count ?? 9}</span>
      <span>{props.on ? (props.label ?? 'none') : 'x'}</span>
      <span>{props.on && (props.count ?? 9)}</span>
      <Label value={props.label ?? 'none'} />
      <ul>{props.items.map(item => <li key={item} data-f={props.flag ?? 'none'}>{item}:{props.count ?? 9}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value: string }) {
  return <i data-v={value}>{value}</i>
}
`,
  },
  props: { flag: false, label: '', count: 0, on: true, items: ['a', 'b'] },
  dataPoints: [
    { name: 'falsy', props: { flag: false, label: '', count: 0, on: true, items: ['a', 'b'] } },
    { name: 'truthy', props: { flag: true, label: 'L', count: 3, on: false, items: ['a'] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s17" data-cat="v=0" data-count="0" data-flag="false" data-label="" data-m="" data-tpl="false||0">
      <span bf="s1"><!--bf:s0--><!--/--></span>
      <b bf="s3"><!--bf:s2--><!--/--></b>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
      <span bf="s8"><!--bf-cond-start:s6--><!--bf:s7--><!--/--><!--bf-cond-end:s6--></span>
      <span bf="s11"><!--bf-cond-start:s9--><!--bf:s10-->0<!--/--><!--bf-cond-end:s9--></span>
      <i bf-s="test_s12" bf="s1" data-v=""><!--bf:s0--><!--/--></i>
      <ul bf="s16">
        <li bf="s15" data-f="false" data-key="a"><!--bf:s13-->a<!--/-->:<!--bf:s14-->0<!--/--></li>
        <li bf="s15" data-f="false" data-key="b"><!--bf:s13-->b<!--/-->:<!--bf:s14-->0<!--/--></li>
      </ul>
    </div>
  `,
})
