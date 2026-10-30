import { createFixture } from '../src/types'

/**
 * `JSON.stringify` writes numbers the way JS does, not in the host
 * language's float notation: an integral float has no `.0` (`-4 / 2` is
 * `-2`), an exponent is neither padded nor written with a `.0` mantissa
 * (`-4e-8`, not `-4e-08` / `-4.0e-8`), magnitudes below 1e21 are written
 * out in full (`-400000000000000000000`) and from 1e21 on in JS's `e+`
 * form (`-4e+21`), notation switches between 1e-6 and 1e-7, the shortest
 * round-trip digits are kept (`-1.3333333333333333`,
 * `0.30000000000000004`), and `Infinity`, `-Infinity` and `NaN` are `null`
 * at any depth. Strings that look like numbers are left alone. Covered at
 * the top level and nested, in attributes and text, a ternary and `&&`
 * branch, concatenation and a template literal, a child prop read through
 * `function C(props)`, and a loop row (object literals in `JSON.stringify`
 * are not supported by the template adapters, so nesting uses arrays).
 */
export const fixture = createFixture({
  id: 'json-stringify-number-spelling',
  description: 'JSON.stringify writes integral floats, exponents and non-finite numbers with JS spelling',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function ShowJson(props: { v: number }) {
  return <i data-j={JSON.stringify(props.v)}>{JSON.stringify([props.v, [props.v / 0]])}</i>
}
export function JsonStringifyNumberSpelling({ n, d, big, z, items }: { n: number; d: number; big: number; z: number; items: number[] }) {
  const [x] = createSignal(-4)
  return (
    <div
      data-int={JSON.stringify([n / 2, n / 8, n / 4e6, n / 4e7])}
      data-exp={JSON.stringify([n / d, n * big, [n * big * 10]])}
      data-inf={JSON.stringify(n / 0)}
    >
      <span>{JSON.stringify(n / 2)}</span>
      <span>{JSON.stringify([n / 3, 0.1 * 3, '-2.0'])}</span>
      <span>{JSON.stringify([n / z, -n / z, z / z, [n / z]])}</span>
      <span>{n < 0 ? JSON.stringify([n / 2, n / d]) : 'pos'}</span>
      <span>{n < 0 && JSON.stringify([[x() / 2], x() * big])}</span>
      <span>{'j=' + JSON.stringify(x() / d)}</span>
      <span>{\`j=\${JSON.stringify([n / 2, n / z])}\`}</span>
      <ShowJson v={n / 2} />
      <ul>{items.map(item => <li key={item} data-j={JSON.stringify(item / 2)}>{JSON.stringify([item / d, item * big])}</li>)}</ul>
    </div>
  )
}
`,
  props: { n: -4, d: 1e8, big: 1e20, z: 0, items: [-4, 3] },
  expectedHtml: `
    <div bf-s="test" bf="s20" data-exp="[-4e-8,-400000000000000000000,[-4e+21]]" data-inf="null" data-int="[-2,-0.5,-0.000001,-1e-7]">
      <span bf="s1"><!--bf:s0-->-2<!--/--></span>
      <span bf="s3"><!--bf:s2-->[-1.3333333333333333,0.30000000000000004,&quot;-2.0&quot;]<!--/--></span>
      <span bf="s5"><!--bf:s4-->[null,null,null,[null]]<!--/--></span>
      <span bf="s8"><!--bf-cond-start:s6--><!--bf:s7-->[-2,-4e-8]<!--/--><!--bf-cond-end:s6--></span>
      <span bf="s11"><!--bf-cond-start:s9--><!--bf:s10-->[[-2],-400000000000000000000]<!--/--><!--bf-cond-end:s9--></span>
      <span bf="s13"><!--bf:s12-->j=-4e-8<!--/--></span>
      <span bf="s15"><!--bf:s14-->j=[-2,null]<!--/--></span>
      <i bf-s="test_s16" bf="s1" data-j="-2"><!--bf:s0-->[-2,[null]]<!--/--></i>
      <ul bf="s19">
        <li bf="s18" data-j="-2" data-key="-4"><!--bf:s17-->[-4e-8,-400000000000000000000]<!--/--></li>
        <li bf="s18" data-j="1.5" data-key="3"><!--bf:s17-->[3e-8,300000000000000000000]<!--/--></li>
      </ul>
    </div>
  `,
})
