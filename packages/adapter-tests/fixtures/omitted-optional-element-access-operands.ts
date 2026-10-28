import { createFixture } from '../src/types'

/**
 * `omitted-optional-number-element-access` with the literal-key read as an
 * operand: an optional-chain receiver (`props['s']?.length`, undefined →
 * empty) and a presence check in a memo (`props['n'] !== undefined`). Each
 * must see the omitted prop as `undefined`, as it does for `props.n` /
 * `props.s`, and a present `0` / `''` as present.
 */
export const fixture = createFixture({
  id: 'omitted-optional-element-access-operands',
  description: 'Omitted optional props read through props[\'x\'] as a ?. receiver and a presence-check operand',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function OmittedOptionalElementAccessOperands(props: { n?: number; s?: string }) {
  const given = createMemo(() => props['n'] !== undefined)
  return (
    <p data-given={given() ? 'y' : 'n'}>
      <span>{props['s']?.length}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-given="n"><span bf="s1"><!--bf:s0--><!--/--></span></p>
  `,
  dataPoints: [
    { name: 'zero-empty', props: { n: 0, s: '' } },
    { name: 'present', props: { n: 1.5, s: 'ab' } },
  ],
})
