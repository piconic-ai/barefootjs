import { createFixture } from '../src/types'

/**
 * `props.x?.length ?? 0` (optional-chained `.length`, defaulted with `??`)
 * as a condition operand. Isolated into its own minimal fixture rather than
 * folded into `nullish-coalescing-condition-operand` (which shares this
 * exact JS shape) because the divergence here is Mojolicious-specific and
 * unrelated to that fixture's Go defect (#3249): see
 * `mojo-optional-chain-length-unguarded-deref`.
 */
export const fixture = createFixture({
  id: 'optional-chain-length-condition',
  description: '`props.x?.length ?? 0` as a condition operand, with the array absent',
  source: `
'use client'
type Props = { items?: number[] }
export function OptionalChainLengthCondition(props: Props) {
  return <div>{(props.items?.length ?? 0) > 0 ? 'has' : 'none'}</div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->none<!--bf-cond-end:s0--></div>
  `,
})
