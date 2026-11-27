import { createFixture } from '../src/types'

/**
 * #3979: a module-level array const built with a spread of a literal array
 * const, passed whole as a child prop: to a child that declares the same
 * array type, to one whose prop is optional, through a middle child that
 * forwards it, and from a loop row. The template passes the expanded
 * literal, as it does for a const written without the spread.
 */
export const fixture = createFixture({
  id: 'module-const-array-spread-child-array-prop',
  description: 'A module-level array const built with a spread, passed whole as a child prop, renders in the child (#3979)',
  source: `
import { Kid, Opt, Mid } from './spread-kids'
const BASE = ['a']
const ALL = [...BASE, 'b"c']
export function ModuleConstArraySpreadChildArrayProp() {
  return (
    <div>
      <Kid xs={ALL} />
      <Opt xs={ALL} />
      <Mid xs={ALL} />
      <ul>
        {['r1', 'r2'].map(r => (
          <li key={r}>
            {r}
            <Kid xs={ALL} />
          </li>
        ))}
      </ul>
    </div>
  )
}
`,
  components: {
    './spread-kids.tsx': `
export function Kid({ xs }: { xs: string[] }) {
  return <i data-x={xs[1]}>{xs.length}|{xs.join(',')}</i>
}
export function Opt(props: { xs?: string[] }) {
  return <b data-n={props.xs?.length ?? 0}>{props.xs?.[0]}</b>
}
export function Mid({ xs }: { xs: string[] }) {
  return <section data-n={xs.length}><Kid xs={xs} /></section>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" data-x="b&quot;c"><!--bf:s0-->2<!--/-->|<!--bf:s1-->a,b&quot;c<!--/--></i>
      <b bf-s="test_s1" bf="s1" data-n="2"><!--bf:s0-->a<!--/--></b>
      <section bf-s="test_s2" bf="s1" data-n="2"><i bf-s="test_s2_s0" bf="s2" data-x="b&quot;c"><!--bf:s0-->2<!--/-->|<!--bf:s1-->a,b&quot;c<!--/--></i></section>
      <ul bf="s5">
        <li data-key="r1"><!--bf:s3-->r1<!--/--><i bf-s="test_s4" bf="s2" data-x="b&quot;c"><!--bf:s0-->2<!--/-->|<!--bf:s1-->a,b&quot;c<!--/--></i></li>
        <li data-key="r2"><!--bf:s3-->r2<!--/--><i bf-s="test_s4" bf="s2" data-x="b&quot;c"><!--bf:s0-->2<!--/-->|<!--bf:s1-->a,b&quot;c<!--/--></i></li>
      </ul>
    </div>
  `,
})
