import { createFixture } from '../src/types'

/**
 * The destructured-props twin of `component-spread-props-in-loop-row`
 * (#3713): a `{...rest}` bag onto a child component inside loop rows, in a
 * component row and in a conditional inside an element row. Each row's
 * child receives every key the rest bag carries.
 */
export const fixture = createFixture({
  id: 'component-rest-spread-in-loop-row',
  description: 'A destructured rest bag spread onto a child component in loop rows',
  source: `
import { Tag } from './tag'
export function RestList({ items, ...rest }: { items: string[]; tone?: string; size?: string; label?: string }) {
  return (
    <div>
      <ul>{items.map((it) => <Tag key={it} {...rest} />)}</ul>
      <ol>{items.map((it) => <li key={it}>{it ? <Tag {...rest} /> : null}</li>)}</ol>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { tone?: string; size?: string; label?: string }) {
  return <span data-tone={props.tone} data-size={props.size}>{props.label}:{props.tone ? 'toned' : 'plain'}</span>
}
`,
  },
  props: { items: ['a', 'b'], tone: 'warm', size: 'l', label: 'ignored' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <span bf-s="Tag_*" bf="s2" data-key="a" data-size="l" data-tone="warm"><!--bf:s0-->ignored<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span>
        <span bf-s="Tag_*" bf="s2" data-key="b" data-size="l" data-tone="warm"><!--bf:s0-->ignored<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span>
      </ul>
      <ol bf="s4">
        <li data-key="a"><!--bf-cond-start:s2--><span bf-s="test_s3" bf="s2" data-size="l" data-tone="warm"><!--bf:s0-->ignored<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span><!--bf-cond-end:s2--></li>
        <li data-key="b"><!--bf-cond-start:s2--><span bf-s="test_s3" bf="s2" data-size="l" data-tone="warm"><!--bf:s0-->ignored<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--></span><!--bf-cond-end:s2--></li>
      </ol>
    </div>
  `,
})
