import { createFixture } from '../src/types'

/**
 * A child prop passed an object literal that reads a module const member: `<Kid v={{ k: o.k }} />`.
 */
export const fixture = createFixture({
  id: 'child-prop-object-reads-module-const-member',
  description: 'A child prop object literal reading a module const member renders the member',
  source: `
const o = { k: 1 }
function Kid(props: { v: { k: number } }) {
  return <i>{props.v.k}</i>
}

export function ChildPropObjectReadsModuleConstMember() {
  return <div><Kid v={{ k: o.k }} /></div>
}
`,
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->1<!--/--></i></div>
  `,
})
