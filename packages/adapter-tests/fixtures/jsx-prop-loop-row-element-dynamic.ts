import { createFixture } from '../src/types'

/**
 * A JSX-valued prop other than `children` that reads the loop row
 * (`header={<i>{x}</i>}`), on a component nested in the row's element. The child renders it
 * directly (`Head`) and seeds a signal from it (`Seeded`); both see the
 * row's value (#3961 review). The other loop position is
 * `jsx-prop-loop-row-component-dynamic`.
 */
export const fixture = createFixture({
  id: 'jsx-prop-loop-row-element-dynamic',
  description: 'A JSX prop reading the loop row reaches a component nested in the row element',
  source: `
'use client'
import { Head, Seeded } from './head'
export function Host(props: { items: string[] }) {
  return (
    <div>
      <ul>{props.items.map((x) => <li key={x}><Head header={<i>{x}</i>} /><Seeded header={<i>{x}</i>} /></li>)}</ul>
    </div>
  )
}
`,
  components: {
    './head.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Head(props: { header?: unknown }) {
  return <h2>{props.header}</h2>
}
export function Seeded(props: { header?: unknown }) {
  const [value] = createSignal(props.header ?? 'missing')
  return <h3>{value() === 'missing' ? 'fallback' : 'header'}</h3>
}
`,
  },
  props: { items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test"><ul bf="s4"><li data-key="a"><h2 bf-s="test_s1" bf="s1"><!--bf:s0--><i><!--bf:^s0-->a<!--/--></i><!--/--></h2><h3 bf-s="test_s3" bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->header<!--/--><!--bf-cond-end:s0--></h3></li><li data-key="b"><h2 bf-s="test_s1" bf="s1"><!--bf:s0--><i><!--bf:^s0-->b<!--/--></i><!--/--></h2><h3 bf-s="test_s3" bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->header<!--/--><!--bf-cond-end:s0--></h3></li></ul></div>
  
  `,
})
