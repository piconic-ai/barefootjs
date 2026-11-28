import { createFixture } from '../src/types'

/**
 * A child prop in a loop row passed an object literal that reads a module const member: `props.rows.map(r => <li key={r}><Kid v={{ k: o.k }} /></li>)`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-prop-object-reads-module-const-member',
  description: 'A loop row child prop object literal reading a module const member renders the member in each row',
  source: `
const o = { k: 'v' }
function Kid(props: { v: { k: string } }) {
  return <i>{props.v.k}</i>
}

export function LoopRowChildPropObjectReadsModuleConstMember(props: { rows: string[] }) {
  return <ul>{props.rows.map(r => <li key={r}><Kid v={{ k: o.k }} /></li>)}</ul>
}
`,
  props: { rows: ['a', 'b'] },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li data-key="a"><i bf-s="test_s0" bf="s1"><!--bf:s0-->v<!--/--></i></li>
      <li data-key="b"><i bf-s="test_s0" bf="s1"><!--bf:s0-->v<!--/--></i></li>
    </ul>
  `,
})
