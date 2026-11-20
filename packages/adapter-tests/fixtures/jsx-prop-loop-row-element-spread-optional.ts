import { createFixture } from '../src/types'

/**
 * A JSX prop reading the loop row (`header={<i>{x}</i>}`), followed by
 * a `{...props}` whose `header` is optional, on a component nested in the row element.
 * When the caller leaves `header` out, the row's JSX is the value, and it
 * has no per-row delivery (#3961 review). With `header` required the spread
 * always wins and the call renders: `jsx-prop-loop-row-spread-required`.
 * The other loop position is `jsx-prop-loop-row-component-spread-optional`.
 */
export const fixture = createFixture({
  id: 'jsx-prop-loop-row-element-spread-optional',
  description: 'A loop row JSX prop stays the value when a later {...props} leaves its optional key out, on a component nested in the row element',
  source: `
'use client'
import { Head } from './head'
export function Host(props: { items: string[]; header?: string }) {
  return (
    <div>
      <ul>{props.items.map((x) => <li key={x}><Head header={<i>{x}</i>} {...props} /></li>)}</ul>
    </div>
  )
}
`,
  components: {
    './head.tsx': `
'use client'
export function Head(props: { header?: unknown }) {
  return <h2>{props.header}</h2>
}
`,
  },
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test"><ul bf="s2"><li data-key="a"><h2 bf-s="test_s1" bf="s1"><!--bf:s0--><i><!--bf:^s0-->a<!--/--></i><!--/--></h2></li><li data-key="b"><h2 bf-s="test_s1" bf="s1"><!--bf:s0--><i><!--bf:^s0-->b<!--/--></i><!--/--></h2></li></ul></div>
  `,
})
