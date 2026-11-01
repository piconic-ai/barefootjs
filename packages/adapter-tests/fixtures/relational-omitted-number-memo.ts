import { createFixture } from '../src/types'

/**
 * A relational comparison over an omitted optional number prop in a memo
 * body (#3824 step 3). JS reads the omitted prop as `undefined`, which
 * ToNumber turns into `NaN`, so every comparison is false; an explicit
 * `null` reads as `0`.
 */
export const fixture = createFixture({
  id: 'relational-omitted-number-memo',
  description: 'A memo comparing an omitted optional number prop is false, and one comparing a null prop reads it as 0',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function RelationalOmittedNumberMemo(props: { n: number; nul: number | null; maybe?: number }) {
  const omittedLt = createMemo(() => props.maybe < props.n)
  const omittedGe = createMemo(() => props.maybe >= props.n)
  const nullLt = createMemo(() => props.nul < props.n)
  return <p>{omittedLt() ? 'T' : 'F'}|{omittedGe() ? 'T' : 'F'}|{nullLt() ? 'T' : 'F'}</p>
}
`,
  props: { n: 1, nul: null },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->F<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->T<!--bf-cond-end:s2--></p>
  `,
})
