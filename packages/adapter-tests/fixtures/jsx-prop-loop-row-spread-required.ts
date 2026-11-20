import { createFixture } from '../src/types'

/**
 * A JSX prop reading the loop row (`header={<i>{x}</i>}`) that a later
 * `{...props}` always replaces: `header` is required, so the caller's value
 * is what every row's component receives, in both loop positions (nested in
 * the row element, and the row itself). Nothing needs a per-row delivery of
 * the JSX, so it renders (#3961 review). With an optional `header` the JSX
 * can stay the value: `jsx-prop-loop-row-element-spread-optional` and
 * `jsx-prop-loop-row-component-spread-optional`.
 */
export const fixture = createFixture({
  id: 'jsx-prop-loop-row-spread-required',
  description: 'A loop row JSX prop that a later {...props} with a required key always replaces renders the spread value',
  source: `
'use client'
import { Head } from './head'
export function Host(props: { items: string[]; header: string }) {
  return (
    <div>
      <ul>{props.items.map((x) => <li key={x}><Head header={<i>{x}</i>} {...props} /></li>)}</ul>
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
  props: { items: ['a', 'b'], header: 'given' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li data-key="a"><h2 bf-s="test_s1" bf="s1"><!--bf:s0-->given<!--/--></h2></li>
        <li data-key="b"><h2 bf-s="test_s1" bf="s1"><!--bf:s0-->given<!--/--></h2></li>
      </ul>
      <section bf="s5">
        <h2 bf-s="Head_*" bf="s1" data-key="a"><!--bf:s0-->given<!--/--></h2>
        <h2 bf-s="Head_*" bf="s1" data-key="b"><!--bf:s0-->given<!--/--></h2>
      </section>
    </div>
  `,
})
