import { createFixture } from '../src/types'

/**
 * An optional-chained read from an object prop used as a condition operand.
 * The present and absent points prove both the value read and the
 * short-circuit path through the real adapter render pipeline (#3275).
 */
export const fixture = createFixture({
  id: 'optional-chain-object-condition',
  description: 'an optional-chained object-prop member used as a condition operand',
  source: `
'use client'
type Props = { meta?: { count: number } }
export function OptionalChainObjectCondition(props: Props) {
  return <div>{(props.meta?.count ?? 0) > 0 ? <b>has</b> : <b>none</b>}</div>
}
`,
  props: { meta: { count: 2 } },
  dataPoints: [
    { name: 'absent-meta', props: {} },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s1"><b bf-c="s0">has</b></div>
  `,
})
