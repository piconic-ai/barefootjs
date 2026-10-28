import { createFixture } from '../src/types'

/**
 * The `-0` of `remainder-negative-zero` converted to a string other than
 * by `+`: `-4 % 2` is `-0`, and every JS string conversion spells it
 * `"0"` — a template literal, `String()`, `.toString()`, `.join`, and a
 * callback's `+`. A backend
 * that keeps the float `-0.0` and converts it with the host's own number
 * spelling renders `-0`. `.includes` and truthiness read it as `0`.
 * Concatenation with `+` is `remainder-negative-zero-concat`, and
 * `JSON.stringify` is `remainder-negative-zero-json`.
 */
export const fixture = createFixture({
  id: 'remainder-negative-zero-string',
  description: 'The -0 remainder of a negative dividend converts to the string "0" (template literal, String, toString, join)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function RemainderNegativeZeroString(props: { n: number }) {
  const [x] = createSignal(-4)
  const [xs] = createSignal([-4, 4])
  return (
    <p data-tpl={\`t=\${props.n % 2}\`}>
      <span>{\`t=\${x() % 2}\`}</span>
      <span>{String(x() % 2)}</span>
      <span>{(x() % 2).toString()}</span>
      <span>{[x() % 2, 1].join('-')}</span>
      <span>{[0].includes(x() % 2) ? 'in' : 'out'}</span>
      <span>{(x() % 2) ? 'T' : 'F'}</span>
      <span>{xs().map(v => 'v=' + (v % 2)).join(',')}</span>
    </p>
  )
}
`,
  props: { n: -4 },
  expectedHtml: `
    <p bf-s="test" bf="s14" data-tpl="t=0">
      <span bf="s1"><!--bf:s0-->t=0<!--/--></span>
      <span bf="s3"><!--bf:s2-->0<!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
      <span bf="s7"><!--bf:s6-->0-1<!--/--></span>
      <span bf="s9"><!--bf-cond-start:s8-->in<!--bf-cond-end:s8--></span>
      <span bf="s11"><!--bf-cond-start:s10-->F<!--bf-cond-end:s10--></span>
      <span bf="s13"><!--bf:s12-->v=0,v=0<!--/--></span>
    </p>
  `,
})
