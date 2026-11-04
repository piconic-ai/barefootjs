import { createFixture } from '../src/types'

/**
 * `includes` / `indexOf` searching for `undefined` or `null`
 * (`spec/js-undefined-value.md` §1): `[null].includes(undefined)` is false
 * and `[null].indexOf(undefined)` is `-1`; an `undefined` element matches
 * `undefined` only. Sources: a `null` element from JSON data, an array
 * literal holding an explicit `null` prop and an omitted prop, and a child
 * receiving the needle as an explicit `null`, a forwarded omitted prop, a
 * literal `undefined` and an omitted prop at the call.
 */
export const fixture = createFixture({
  id: 'undef-null-array-search',
  description: 'includes / indexOf tell an undefined needle or element from a null one',
  source: `
import { Find } from './find'
export function UndefNullArraySearch(props: { items: (string | null)[]; n?: string | null; u?: string | null }) {
  return (
    <div data-i={props.items.includes(undefined) ? 'y' : 'n'}>
      <p>{props.items.includes(undefined) ? 'y' : 'n'}|{props.items.includes(null) ? 'y' : 'n'}|{props.items.indexOf(undefined)}|{props.items.indexOf(null)}</p>
      <p>{[props.n].includes(undefined) ? 'y' : 'n'}|{[props.u].includes(undefined) ? 'y' : 'n'}|{[props.n].indexOf(undefined)}|{[props.u].indexOf(null)}</p>
      <Find items={props.items} needle={props.n} />
      <Find items={props.items} needle={props.u} />
      <Find items={props.items} needle={undefined} />
      <Find items={props.items} />
    </div>
  )
}
`,
  components: {
    './find.tsx': `
export function Find(props: { items: (string | null)[]; needle?: string | null }) {
  return <i>{props.items.includes(props.needle) ? 'y' : 'n'}|{props.items.indexOf(props.needle)}</i>
}
`,
  },
  props: { items: ['a', null], n: null },
  expectedHtml: `
    <div bf-s="test" bf="s18" data-i="n">
      <p bf="s6"><!--bf-cond-start:s0--><!--bf:s1-->n<!--/--><!--bf-cond-end:s0-->|<!--bf-cond-start:s2-->y<!--bf-cond-end:s2-->|<!--bf:s4-->-1<!--/-->|<!--bf:s5-->1<!--/--></p>
      <p bf="s13"><!--bf-cond-start:s7--><!--bf:s8-->n<!--/--><!--bf-cond-end:s7-->|<!--bf-cond-start:s9-->y<!--bf-cond-end:s9-->|<!--bf:s11-->-1<!--/-->|<!--bf:s12-->-1<!--/--></p>
      <i bf-s="test_s14" bf="s2"><!--bf-cond-start:s0-->y<!--bf-cond-end:s0-->|<!--bf:s1-->1<!--/--></i>
      <i bf-s="test_s15" bf="s2"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0-->|<!--bf:s1-->-1<!--/--></i>
      <i bf-s="test_s16" bf="s2"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0-->|<!--bf:s1-->-1<!--/--></i>
      <i bf-s="test_s17" bf="s2"><!--bf-cond-start:s0-->n<!--bf-cond-end:s0-->|<!--bf:s1-->-1<!--/--></i>
    </div>
  `,
})
