import { createFixture } from '../src/types'

/**
 * An open-type `{...rest}` bag spread onto a child component (#3714): the
 * rest object holds the caller's props without the keys the component
 * destructured, so a destructured key (`title`, the renamed `label`, the
 * defaulted `kind`) never reaches the child through it, and the spread
 * merges with the call's explicit props in source order. Covered at the
 * top level, through a local alias of the bag, in a conditional branch and
 * in loop rows.
 */
export const fixture = createFixture({
  id: 'open-rest-spread-child-omits-keys',
  description: 'An open rest bag spread onto a child component leaves out the destructured keys',
  source: `
import { Tag } from './tag'
type CardProps = { title?: string; label?: string; kind?: string; tone?: string; size?: string; items: string[]; [key: string]: unknown }
export function Card({ title, label: text, kind = 'k', items, ...rest }: CardProps) {
  const bag = rest
  return (
    <div data-own={title} data-text={text} data-kind={kind}>
      <Tag {...rest} />
      <Tag title="x" {...rest} />
      <Tag {...rest} tone="after" />
      <Tag tone="before" size="before" {...rest} />
      <Tag tone="alias" {...bag} />
      {title ? <Tag {...rest} /> : null}
      <ul>{items.map((it) => <li key={it}><Tag label={it} {...rest} /></li>)}</ul>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { title?: string; label?: string; kind?: string; tone?: string; size?: string }) {
  return <b data-title={props.title} data-kind={props.kind} data-tone={props.tone} data-size={props.size}>{props.label}</b>
}
`,
  },
  props: { title: 'T', label: 'L', kind: 'K', tone: 'warm', items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-kind="K" data-own="T" data-text="L">
      <b bf-s="test_s0" bf="s1" data-tone="warm"><!--bf:s0--><!--/--></b>
      <b bf-s="test_s1" bf="s1" data-title="x" data-tone="warm"><!--bf:s0--><!--/--></b>
      <b bf-s="test_s2" bf="s1" data-tone="after"><!--bf:s0--><!--/--></b>
      <b bf-s="test_s3" bf="s1" data-size="before" data-tone="warm"><!--bf:s0--><!--/--></b>
      <b bf-s="test_s4" bf="s1" data-tone="warm"><!--bf:s0--><!--/--></b>
      <!--bf-cond-start:s5-->
      <b bf-s="test_s6" bf="s1" data-tone="warm"><!--bf:s0--><!--/--></b>
      <!--bf-cond-end:s5-->
      <ul bf="s8">
        <li data-key="a"><b bf-s="test_s7" bf="s1" data-tone="warm"><!--bf:s0-->a<!--/--></b></li>
        <li data-key="b"><b bf-s="test_s7" bf="s1" data-tone="warm"><!--bf:s0-->b<!--/--></b></li>
      </ul>
    </div>
  `,
})
