import { createFixture } from '../src/types'

/**
 * A signal seeded from an object literal with an `undefined` member
 * (`createSignal({ a: null, b: undefined })`) holds `b` as a present key
 * whose value is `undefined` (`spec/js-undefined-value.md` §1):
 * `Object.entries` yields it (`b=undefined`), a read of it is `undefined`,
 * and `JSON.stringify` drops it. A key the literal does not write (`c`) is
 * missing. The array twin is `undef-array-element-signal-seed`.
 */
export const fixture = createFixture({
  id: 'undef-object-member-signal-seed',
  description: 'A signal seeded from an object literal keeps an undefined member as a present key',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type O = Record<string, string | null | undefined>
export function UndefObjectMemberSignalSeed() {
  const [o] = createSignal<O>({ a: null, b: undefined })
  return (
    <div>
      <p>{Object.entries(o()).map(([k, v]) => <i key={k}>{k}={String(v)}</i>)}</p>
      <b>{o().b === undefined ? 'u' : 'd'}|{o().c === undefined ? 'u' : 'd'}|{JSON.stringify(o())}</b>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2">
        <i data-key="a"><!--bf:s0-->a<!--/-->=<!--bf:s1-->null<!--/--></i>
        <i data-key="b"><!--bf:s0-->b<!--/-->=<!--bf:s1-->undefined<!--/--></i>
      </p>
      <b bf="s6"><!--bf-cond-start:s3-->u<!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->u<!--bf-cond-end:s4-->|<!--bf:s5-->{&quot;a&quot;:null}<!--/--></b>
    </div>
  `,
})
