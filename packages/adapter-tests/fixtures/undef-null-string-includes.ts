import { createFixture } from '../src/types'

/**
 * A string search ToStrings its needle (`spec/js-undefined-value.md` §1):
 * `"aundefinedb".includes(undefined)` is true and `.includes(null)` is
 * false, while `"anullb"` answers the other way round and `"ab"` finds
 * neither. Covers `includes`, `indexOf` and `startsWith` on a string
 * receiver. Needles: an explicit `null` prop, an omitted prop, and a child
 * receiving each of them forwarded, a literal `null`, a literal
 * `undefined` and an omitted prop at the call.
 */
export const fixture = createFixture({
  id: 'undef-null-string-includes',
  description: 'includes / indexOf / startsWith on a string ToString an undefined or null needle',
  source: `
import { Search } from './search'
export function UndefNullStringIncludes(props: { su: string; sn: string; s0: string; n?: string | null; u?: string | null }) {
  return (
    <div data-u={props.su.includes(props.u) ? 'Y' : 'N'} data-n={props.su.includes(props.n) ? 'Y' : 'N'}>
      <p>{props.su.includes(props.n) ? 'Y' : 'N'}|{props.su.includes(props.u) ? 'Y' : 'N'}|{props.sn.includes(props.n) ? 'Y' : 'N'}|{props.sn.includes(props.u) ? 'Y' : 'N'}|{props.s0.includes(props.n) ? 'Y' : 'N'}|{props.s0.includes(props.u) ? 'Y' : 'N'}</p>
      <p>{props.su.indexOf(props.n)}|{props.su.indexOf(props.u)}|{props.sn.indexOf(props.n)}|{props.sn.indexOf(props.u)}</p>
      <Search s={props.su} needle={props.n} />
      <Search s={props.su} needle={props.u} />
      <Search s={props.sn} needle={null} />
      <Search s={props.su} needle={undefined} />
      <Search s={props.su} />
    </div>
  )
}
`,
  components: {
    './search.tsx': `
export function Search(props: { s: string; needle?: string | null }) {
  return <i>{props.s.includes(props.needle) ? 'Y' : 'N'}|{props.s.indexOf(props.needle)}|{props.s.startsWith(props.needle) ? 'Y' : 'N'}</i>
}
`,
  },
  props: { su: 'aundefinedb', sn: 'anullb', s0: 'ab', n: null },
  expectedHtml: `
    <div bf-s="test" bf="s17" data-n="N" data-u="Y">
      <p bf="s6"><!--bf-cond-start:s0-->N<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->Y<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->Y<!--bf-cond-end:s2-->|<!--bf-cond-start:s3-->N<!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->N<!--bf-cond-end:s4-->|<!--bf-cond-start:s5-->N<!--bf-cond-end:s5--></p>
      <p bf="s11"><!--bf:s7-->-1<!--/-->|<!--bf:s8-->1<!--/-->|<!--bf:s9-->1<!--/-->|<!--bf:s10-->-1<!--/--></p>
      <i bf-s="test_s12" bf="s3"><!--bf-cond-start:s0-->N<!--bf-cond-end:s0-->|<!--bf:s1-->-1<!--/-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2--></i>
      <i bf-s="test_s13" bf="s3"><!--bf-cond-start:s0-->Y<!--bf-cond-end:s0-->|<!--bf:s1-->1<!--/-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2--></i>
      <i bf-s="test_s14" bf="s3"><!--bf-cond-start:s0-->Y<!--bf-cond-end:s0-->|<!--bf:s1-->1<!--/-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2--></i>
      <i bf-s="test_s15" bf="s3"><!--bf-cond-start:s0-->Y<!--bf-cond-end:s0-->|<!--bf:s1-->1<!--/-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2--></i>
      <i bf-s="test_s16" bf="s3"><!--bf-cond-start:s0-->Y<!--bf-cond-end:s0-->|<!--bf:s1-->1<!--/-->|<!--bf-cond-start:s2-->N<!--bf-cond-end:s2--></i>
    </div>
  `,
})
