import { createFixture } from '../src/types'

/**
 * A signal seeded from an array literal whose element is `undefined`
 * (`createSignal([undefined, 'x'])`) holds `undefined` at that index, apart
 * from `null` (`spec/js-undefined-value.md` §1): `a()[0] === undefined` is
 * true, and `JSON.stringify` writes the element as `null`.
 */
export const fixture = createFixture({
  id: 'undef-array-element-signal-seed',
  description: 'A signal seeded from an array literal keeps an undefined element apart from null',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function UndefArrayElementSignalSeed() {
  const [a] = createSignal<(string | null | undefined)[]>([undefined, null, 'x'])
  return (
    <p>
      {a()[0] === undefined ? 'undef' : 'other'}|{a()[1] === null ? 'null' : 'other'}|{JSON.stringify(a())}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf-cond-start:s0-->undef<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->null<!--bf-cond-end:s1-->|<!--bf:s2-->[null,null,&quot;x&quot;]<!--/--></p>
  `,
})
