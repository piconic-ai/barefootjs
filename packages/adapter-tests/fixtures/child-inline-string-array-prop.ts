import { createFixture } from '../src/types'

/**
 * An inline array literal passed to a child's `string[]`, `number[]` or
 * `boolean[]` prop. The child reads it by index, by length, joined, and in
 * a loop row, through destructured props and `function C(props)`. The
 * numbers keep every literal spelling (`1e3`, `0x10`, `.5`, `-0`).
 */
export const fixture = createFixture({
  id: 'child-inline-string-array-prop',
  description: 'Inline scalar array literals passed to typed child array props',
  source: `
import { Kid } from './Kid'
import { List } from './List'
import { Nums } from './Nums'
export function ChildInlineStringArrayProp() {
  return (
    <div>
      <Kid xs={['a', 'b']} />
      <List items={['x', 'y', 'z']} />
      <Nums ns={[1e3, 0x10, .5, -0, 2]} bs={[false, true]} />
    </div>
  )
}
`,
  components: {
    './Kid': `
export function Kid(props: { xs: string[] }) {
  return <i title={props.xs[1]}>{props.xs[0]}|{props.xs.length}</i>
}
`,
    './List': `
export function List({ items }: { items: string[] }) {
  return <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
}
`,
    './Nums': `
export function Nums({ ns, bs }: { ns: number[]; bs: boolean[] }) {
  return <p data-n={ns[2]}>{ns.join(',')}|{ns[0] + 1}|{bs[0] ? 'y' : 'n'}|{bs[1] ? 'y' : 'n'}|{bs.length}</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" title="b"><!--bf:s0-->a<!--/-->|<!--bf:s1-->2<!--/--></i>
      <ul bf-s="test_s1" bf="s1">
        <li data-key="x"><!--bf:s0-->x<!--/--></li>
        <li data-key="y"><!--bf:s0-->y<!--/--></li>
        <li data-key="z"><!--bf:s0-->z<!--/--></li>
      </ul>
      <p bf-s="test_s2" bf="s5" data-n="0.5"><!--bf:s0-->1000,16,0.5,0,2<!--/-->|<!--bf:s1-->1001<!--/-->|<!--bf-cond-start:s2-->n<!--bf-cond-end:s2-->|<!--bf-cond-start:s3-->y<!--bf-cond-end:s3-->|<!--bf:s4-->2<!--/--></p>
    </div>
  `,
})
