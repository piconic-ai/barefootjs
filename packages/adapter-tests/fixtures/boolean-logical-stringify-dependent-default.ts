import { createFixture } from '../src/types'

/**
 * A stringified `&&` over an optional boolean prop whose destructure
 * default reads an earlier boolean prop (`{ off = false, on = off }`,
 * #3443): the default is boolean, so the prop prints `true` / `false`.
 */
export const fixture = createFixture({
  id: 'boolean-logical-stringify-dependent-default',
  description: 'A stringified && over a boolean prop defaulted to an earlier boolean prop renders true / false',
  source: `
'use client'
export function BooleanLogicalStringifyDependentDefault({ off = false, on = off }: { off?: boolean; on?: boolean }) {
  return <p>{String(on && true)}</p>
}
`,
  props: { on: true },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->true<!--/--></p>
  `,
})
