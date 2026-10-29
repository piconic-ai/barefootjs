import { createFixture } from '../src/types'

/**
 * `JSON.stringify` of the `-0` remainder (`-4 % 2`) in more positions than
 * `remainder-negative-zero-json`: destructured props, a ternary and `&&`
 * branch, a child prop read through `function C(props)`, a loop row,
 * concatenation and a template literal, and nested inside an array (object
 * literals in `JSON.stringify` are not supported by the template adapters).
 * JS writes `-0` as `0` at any depth.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero-json-positions',
  description: 'JSON.stringify writes the -0 remainder as 0 in every position and at any depth',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function ShowJson(props: { v: number }) {
  return <i data-j={JSON.stringify(props.v)}>{JSON.stringify([props.v])}</i>
}
export function RemainderNegativeZeroJsonPositions({ n, items }: { n: number; items: number[] }) {
  const [x] = createSignal(-4)
  return (
    <div data-obj={JSON.stringify([n % 2, [n % 2]])}>
      <span>{n < 0 ? JSON.stringify(n % 2) : 'pos'}</span>
      <span>{n < 0 && JSON.stringify([[x() % 2], -1])}</span>
      <span>{'j=' + JSON.stringify(x() % 2)}</span>
      <span>{\`j=\${JSON.stringify([n % 2])}\`}</span>
      <ShowJson v={n % 2} />
      <ul>{items.map(item => <li key={item} data-j={JSON.stringify(item % 2)}>{JSON.stringify([item % 2])}</li>)}</ul>
    </div>
  )
}
`,
  props: { n: -4, items: [-4, -3] },
  expectedHtml: `
    <div bf-s="test" bf="s14" data-obj="[0,[0]]">
      <span bf="s2"><!--bf-cond-start:s0--><!--bf:s1-->0<!--/--><!--bf-cond-end:s0--></span>
      <span bf="s5"><!--bf-cond-start:s3--><!--bf:s4-->[[0],-1]<!--/--><!--bf-cond-end:s3--></span>
      <span bf="s7"><!--bf:s6-->j=0<!--/--></span>
      <span bf="s9"><!--bf:s8-->j=[0]<!--/--></span>
      <i bf-s="test_s10" bf="s1" data-j="0"><!--bf:s0-->[0]<!--/--></i>
      <ul bf="s13">
        <li bf="s12" data-j="0" data-key="-4"><!--bf:s11-->[0]<!--/--></li>
        <li bf="s12" data-j="-1" data-key="-3"><!--bf:s11-->[-1]<!--/--></li>
      </ul>
    </div>
  `,
})
