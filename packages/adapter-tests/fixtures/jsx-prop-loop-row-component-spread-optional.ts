import { createFixture } from '../src/types'

/**
 * A JSX prop reading the loop row (`header={<i>{x}</i>}`), followed by
 * a `{...props}` whose `header` is optional, on a component that is the row itself.
 * When the caller leaves `header` out, the row's JSX is the value, and it
 * has no per-row delivery (#3961 review). With `header` required the spread
 * always wins and the call renders: `jsx-prop-loop-row-spread-required`.
 * The other loop position is `jsx-prop-loop-row-element-spread-optional`.
 */
export const fixture = createFixture({
  id: 'jsx-prop-loop-row-component-spread-optional',
  description: 'A loop row JSX prop stays the value when a later {...props} leaves its optional key out, on a component that is the row itself',
  source: `
'use client'
import { Head } from './head'
export function Host(props: { items: string[]; header?: string }) {
  return (
    <div>
      <section>{props.items.map((x) => <Head key={x} header={<i>{x}</i>} {...props} />)}</section>
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
    <div bf-s="test"><section bf="s2"><h2 bf-s="Head_*" bf="s1" data-key="a"><!--bf:s0--><i><!--bf:^s0-->a<!--/--></i><!--/--></h2><h2 bf-s="Head_*" bf="s1" data-key="b"><!--bf:s0--><i><!--bf:^s0-->b<!--/--></i><!--/--></h2></section></div>
  `,
})
