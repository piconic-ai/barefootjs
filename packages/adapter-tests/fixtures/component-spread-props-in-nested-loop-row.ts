import { createFixture } from '../src/types'

/**
 * Sibling of `component-spread-props-in-loop-row` for the row of a loop
 * inside another loop's row: once under an element row, once as the
 * forwarded children of a component row. `size` comes before the spread, so
 * the caller's `size` wins where it passed one; `label` comes after it, so
 * the inner row's own value always wins.
 */
export const fixture = createFixture({
  id: 'component-spread-props-in-nested-loop-row',
  description: "A props spread onto the row component of a loop inside another loop's row, merged in source order",
  source: `
'use client'
import { Tag } from './tag'

function Box(props: { children?: any }) {
  return <div>{props.children}</div>
}

type Group = { id: string; items: string[] }

export function List(props: { groups: Group[]; tone?: string; size?: string; label?: string }) {
  return (
    <div>
      {props.groups.map(g => (
        <ul key={g.id}>{g.items.map(it => <Tag key={it} size="s" {...props} label={it} />)}</ul>
      ))}
      {props.groups.map(g => (
        <Box key={g.id}>{g.items.map(it => <Tag key={it} size="s" {...props} label={it} />)}</Box>
      ))}
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
  props: { groups: [{ id: 'x', items: ['a', 'b'] }, { id: 'y', items: ['c'] }], tone: 'warm', size: 'l', label: 'ignored' },
  expectedHtml: `
    <div bf-s="test" bf="s4">
      <ul bf="s1" data-key="x">
        <span bf-s="Tag_*" bf="s3" data-key="a" data-size="l" data-tone="warm" title="row-a"><!--bf:s0-->a<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
        <span bf-s="Tag_*" bf="s3" data-key="b" data-size="l" data-tone="warm" title="row-b"><!--bf:s0-->b<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
      </ul>
      <ul bf="s1" data-key="y"><span bf-s="Tag_*" bf="s3" data-key="c" data-size="l" data-tone="warm" title="row-c"><!--bf:s0-->c<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span></ul>
      <div bf-s="Box_*" data-key="x">
        <span bf-s="Tag_*" bf="s3" data-key="a" data-size="l" data-tone="warm" title="row-a"><!--bf:s0-->a<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
        <span bf-s="Tag_*" bf="s3" data-key="b" data-size="l" data-tone="warm" title="row-b"><!--bf:s0-->b<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span>
      </div>
      <div bf-s="Box_*" data-key="y"><span bf-s="Tag_*" bf="s3" data-key="c" data-size="l" data-tone="warm" title="row-c"><!--bf:s0-->c<!--/-->:<!--bf-cond-start:s1-->toned<!--bf-cond-end:s1--><!--bf-cond-start:s2-->!<!--bf-cond-end:s2--></span></div>
    </div>
  `,
})
