import { createFixture } from '../src/types'

/**
 * A JSX-valued prop other than `children` that reads the loop row
 * (`header={<i>{x}</i>}`), on a component that is the row itself. The child renders it
 * directly (`Head`) and seeds a signal from it (`Seeded`); both see the
 * row's value (#3961 review). The other loop position is
 * `jsx-prop-loop-row-element-dynamic`.
 */
export const fixture = createFixture({
  id: 'jsx-prop-loop-row-component-dynamic',
  description: 'A JSX prop reading the loop row reaches a component that is the row itself',
  source: `
'use client'
import { Head, Seeded } from './head'
export function Host(props: { items: string[] }) {
  return (
    <div>
      <section>{props.items.map((x) => <Head key={x} header={<i>{x}</i>} />)}</section>
      <aside>{props.items.map((x) => <Seeded key={x} header={<i>{x}</i>} />)}</aside>
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
    <div bf-s="test">
      <section bf="s2">
        <h2 bf-s="Head_*" bf="s1" data-key="a"><!--bf:s0--><i><!--bf:^s0-->a<!--/--></i><!--/--></h2>
        <h2 bf-s="Head_*" bf="s1" data-key="b"><!--bf:s0--><i><!--bf:^s0-->b<!--/--></i><!--/--></h2>
      </section>
      <aside bf="s5">
        <h3 bf-s="Seeded_*" bf="s2" data-key="a"><!--bf-cond-start:s0--><!--bf:s1-->header<!--/--><!--bf-cond-end:s0--></h3>
        <h3 bf-s="Seeded_*" bf="s2" data-key="b"><!--bf-cond-start:s0--><!--bf:s1-->header<!--/--><!--bf-cond-end:s0--></h3>
      </aside>
    </div>
  `,
})
