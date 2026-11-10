import { createFixture } from '../src/types'

/**
 * A module array const passed whole as a child prop (`<Kid xs={QS} />`) is
 * the array: the child reads it by index, by `length`, joined and in a
 * loop row, as it does an inline array literal
 * (`child-inline-string-array-prop`). The template receives the props, not
 * the module's consts, so a backend that reads `QS` as a template variable
 * hands the child an empty value. Children: a destructured one and a
 * `function C(props)` one; values: a string array (with a quote) and a
 * number array (`1e3`, `.5`). A component-local const array passed the
 * same way is the control.
 */
export const fixture = createFixture({
  id: 'module-const-array-child-prop',
  description: 'a module array const passed whole as a child prop reaches the child as the array',
  source: `
import { Kid, PropsKid, Nums } from './kids'
const QS = ['a', 'b"c']
const NS = [1e3, .5, 2]
export function ModuleConstArrayChildProp() {
  const local = ['l0', 'l1', 'l2']
  return (
    <div>
      <Kid xs={QS} />
      <PropsKid xs={QS} />
      <Nums ns={NS} />
      <Kid xs={local} />
    </div>
  )
}
`,
  components: {
    './kids.tsx': `
export function Kid({ xs }: { xs: string[] }) {
  return <i data-x={xs[1]}>{xs.length}|{xs.join(',')}</i>
}
export function PropsKid(props: { xs: string[] }) {
  return (
    <ul data-x={props.xs[1]} data-n={props.xs.length}>
      {props.xs.map(x => <li key={x}>{x}</li>)}
    </ul>
  )
}
export function Nums({ ns }: { ns: number[] }) {
  return <p data-n={ns[1]}>{ns[0] + 1}|{ns.length}</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" data-x="b&quot;c"><!--bf:s0-->2<!--/-->|<!--bf:s1-->a,b&quot;c<!--/--></i>
      <ul bf-s="test_s1" bf="s1" data-n="2" data-x="b&quot;c">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="b&quot;c"><!--bf:s0-->b&quot;c<!--/--></li>
      </ul>
      <p bf-s="test_s2" bf="s2" data-n="0.5"><!--bf:s0-->1001<!--/-->|<!--bf:s1-->3<!--/--></p>
      <i bf-s="test_s3" bf="s2" data-x="l1"><!--bf:s0-->3<!--/-->|<!--bf:s1-->l0,l1,l2<!--/--></i>
    </div>
  `,
})
