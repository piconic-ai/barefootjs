import { createFixture } from '../src/types'

/**
 * Sibling of `module-const-array-child-prop`: the module array const is
 * passed whole from inside a loop row, and through an intermediate child
 * that forwards its prop to a grandchild unchanged. A destructured prop
 * named `PS` shadows the module const of that name, so `xs={PS}` passes
 * the prop, not the module array.
 */
export const fixture = createFixture({
  id: 'module-const-array-child-prop-forwarded',
  description: 'a module array const passed whole in a loop row and through a forwarding child reaches the child',
  source: `
import { Kid, Mid } from './fwd-kids'
const QS = ['a', 'b']
const PS = ['mod0', 'mod1', 'mod2']
export function ModuleConstArrayChildPropForwarded({ PS }: { PS: string[] }) {
  return (
    <div>
      <ul>
        {['r1', 'r2'].map(r => (
          <li key={r}>
            {r}
            <Kid xs={QS} />
          </li>
        ))}
      </ul>
      <Mid xs={QS} />
      <Kid xs={PS} />
    </div>
  )
}
`,
  components: {
    './fwd-kids.tsx': `
export function Kid({ xs }: { xs: string[] }) {
  return <i data-x={xs[1]}>{xs.length}</i>
}
export function Mid({ xs }: { xs: string[] }) {
  return <section data-n={xs.length}><Kid xs={xs} /></section>
}
`,
  },
  props: { PS: ['p0', 'p"1'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2">
        <li data-key="r1"><!--bf:s0-->r1<!--/--><i bf-s="test_s1" bf="s1" data-x="b"><!--bf:s0-->2<!--/--></i></li>
        <li data-key="r2"><!--bf:s0-->r2<!--/--><i bf-s="test_s1" bf="s1" data-x="b"><!--bf:s0-->2<!--/--></i></li>
      </ul>
      <section bf-s="test_s3" bf="s1" data-n="2"><i bf-s="test_s3_s0" bf="s1" data-x="b"><!--bf:s0-->2<!--/--></i></section>
      <i bf-s="test_s4" bf="s1" data-x="p&quot;1"><!--bf:s0-->2<!--/--></i>
    </div>
  `,
})
