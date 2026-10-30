import { createFixture } from '../src/types'

/**
 * `{...props}` onto a child component inside loop rows (#3713): the row's
 * child receives the caller's keys merged with the call's explicit props in
 * source order. `size` comes before the spread, so the caller's `size` wins
 * where it passed one; `label` comes after it, so the row's own value always
 * wins. Covered rows: a component row, an element row wrapping the child and
 * a conditional inside a row. The child reads the keys in an attribute,
 * text, a ternary, `&&` and a template literal. A static-array row is
 * `component-spread-props-in-static-loop-row`; a nested loop's row is
 * covered by the client tests only (go-template can't render a component
 * row of an inner loop over an object prop, spread or not). The
 * destructured-props twin is `component-rest-spread-in-loop-row`.
 */
export const fixture = createFixture({
  id: 'component-spread-props-in-loop-row',
  description: 'A props spread onto a child component in loop rows, merged in source order',
  source: `
import { Tag } from './tag'
export function List(props: { items: string[]; tone?: string; size?: string; label?: string }) {
  return (
    <div>
      <ul>{props.items.map((it) => <Tag key={it} size="s" {...props} label={it} />)}</ul>
      <ol>{props.items.map((it) => <li key={it}><Tag size="s" {...props} label={it} /></li>)}</ol>
      <section>{props.items.map((it) => <p key={it}>{props.tone ? <Tag size="s" {...props} label={it} /> : null}</p>)}</section>
    </div>
  )
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { tone?: string; size?: string; label?: string }) {
  return (
    <span data-tone={props.tone} data-size={props.size} title={\`row-\${props.label}\`}>
      {props.label}:{props.tone ? 'toned' : 'plain'}{props.size === 'l' && '!'}
    </span>
  )
}
`,
  },
  props: { items: ['a', 'b'], tone: 'warm', size: 'l', label: 'ignored' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <span bf-s="Tag_*" bf="s3" data-key="a" data-size="l" data-tone="warm" title="row-a"><!--bf:s0-->a<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
        <span bf-s="Tag_*" bf="s3" data-key="b" data-size="l" data-tone="warm" title="row-b"><!--bf:s0-->b<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
      </ul>
      <ol bf="s3">
        <li data-key="a"><span bf-s="test_s2" bf="s3" data-size="l" data-tone="warm" title="row-a"><!--bf:s0-->a<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span></li>
        <li data-key="b"><span bf-s="test_s2" bf="s3" data-size="l" data-tone="warm" title="row-b"><!--bf:s0-->b<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span></li>
      </ol>
      <section bf="s7">
        <p bf="s6" data-key="a"><!--bf-cond-start:s4--><span bf-s="test_s5" bf="s3" data-size="l" data-tone="warm" title="row-a"><!--bf:s0-->a<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span><!--bf-cond-end:s4--></p>
        <p bf="s6" data-key="b"><!--bf-cond-start:s4--><span bf-s="test_s5" bf="s3" data-size="l" data-tone="warm" title="row-b"><!--bf:s0-->b<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span><!--bf-cond-end:s4--></p>
      </section>
    </div>
  `,
})
