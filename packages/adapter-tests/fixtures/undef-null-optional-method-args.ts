import { createFixture } from '../src/types'

/**
 * An optional method argument given `undefined` takes the argument's
 * default, while `null` is coerced (`spec/js-undefined-value.md` §1):
 * `[1,2].slice(0, x)` is `[1,2]` / `[]`, `[1,2].join(x)` is `1,2` /
 * `1null2`, and `'abc'.padStart(5, x)` is `  abc` / `nuabc` (`substring`
 * is left out: the compiler does not lower it). Sources: a child receiving
 * an explicit `null` prop and an omitted prop forwarded, a literal `null`,
 * a literal `undefined`, and an omitted prop at the call.
 */
export const fixture = createFixture({
  id: 'undef-null-optional-method-args',
  description: 'slice / join / padStart take the default for an undefined argument and coerce a null one',
  source: `
import { Args } from './args'
export function UndefNullOptionalMethodArgs(props: { nums: number[]; s: string; n?: number | null; u?: number | null; sn?: string | null; su?: string | null }) {
  return (
    <div>
      <Args nums={props.nums} s={props.s} end={props.n} sep={props.sn} />
      <Args nums={props.nums} s={props.s} end={props.u} sep={props.su} />
      <Args nums={props.nums} s={props.s} end={null} sep={null} />
      <Args nums={props.nums} s={props.s} end={undefined} sep={undefined} />
      <Args nums={props.nums} s={props.s} />
    </div>
  )
}
`,
  components: {
    './args.tsx': `
export function Args(props: { nums: number[]; s: string; end?: number | null; sep?: string | null }) {
  return <i>[{props.nums.slice(0, props.end).join(',')}]|[{props.nums.join(props.sep)}]|[{props.s.padStart(5, props.sep)}]</i>
}
`,
  },
  props: { nums: [1, 2], s: 'abc', n: null, sn: null },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s3">[<!--bf:s0--><!--/-->]|[<!--bf:s1-->1null2<!--/-->]|[<!--bf:s2-->nuabc<!--/-->]</i>
      <i bf-s="test_s1" bf="s3">[<!--bf:s0-->1,2<!--/-->]|[<!--bf:s1-->1,2<!--/-->]|[<!--bf:s2--> abc<!--/-->]</i>
      <i bf-s="test_s2" bf="s3">[<!--bf:s0--><!--/-->]|[<!--bf:s1-->1null2<!--/-->]|[<!--bf:s2-->nuabc<!--/-->]</i>
      <i bf-s="test_s3" bf="s3">[<!--bf:s0-->1,2<!--/-->]|[<!--bf:s1-->1,2<!--/-->]|[<!--bf:s2--> abc<!--/-->]</i>
      <i bf-s="test_s4" bf="s3">[<!--bf:s0-->1,2<!--/-->]|[<!--bf:s1-->1,2<!--/-->]|[<!--bf:s2--> abc<!--/-->]</i>
    </div>
  `,
})
