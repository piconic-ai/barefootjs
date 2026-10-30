import { createFixture } from '../src/types'

/**
 * A boolean text child renders nothing, as JSX renders no `true` / `false`
 * child: a boolean prop read directly, a boolean `??` returns (present
 * `false` / `true`, and an absent prop taking the fallback for contrast),
 * in a ternary branch, as an `&&` operand, in a loop row and through a
 * `boolean | string` child prop rendered as a text child.
 */
export const fixture = createFixture({
  id: 'boolean-text-child',
  description: 'A boolean text child renders nothing',
  source: `
import { FlagText } from './flag-text'
export function BooleanTextChild(props: { flag: boolean; off?: boolean; on?: boolean; missing?: boolean; items: string[] }) {
  return (
    <div>
      <span>{props.flag}</span>
      <span>{props.off ?? 'none'}</span>
      <span>{props.on ?? 'none'}</span>
      <span>{props.missing ?? 'none'}</span>
      <span>{props.on ? (props.off ?? 'none') : 'x'}</span>
      <span>{props.on && (props.off ?? 'none')}</span>
      <FlagText value={props.off ?? 'none'} />
      <ul>{props.items.map(item => <li key={item}>{item}:{props.off ?? 'none'}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './flag-text.tsx': `
export function FlagText({ value }: { value: boolean | string }) {
  return <i>{value}</i>
}
`,
  },
  props: { flag: false, off: false, on: true, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0--><!--/--></span>
      <span bf="s3"><!--bf:s2--><!--/--></span>
      <span bf="s5"><!--bf:s4--><!--/--></span>
      <span bf="s7"><!--bf:s6-->none<!--/--></span>
      <span bf="s10"><!--bf-cond-start:s8--><!--bf:s9--><!--/--><!--bf-cond-end:s8--></span>
      <span bf="s13"><!--bf-cond-start:s11--><!--bf:s12--><!--/--><!--bf-cond-end:s11--></span>
      <i bf-s="test_s14" bf="s1"><!--bf:s0--><!--/--></i>
      <ul bf="s18">
        <li bf="s17" data-key="a"><!--bf:s15-->a<!--/-->:<!--bf:s16--><!--/--></li>
        <li bf="s17" data-key="b"><!--bf:s15-->b<!--/-->:<!--bf:s16--><!--/--></li>
      </ul>
    </div>
  `,
})
