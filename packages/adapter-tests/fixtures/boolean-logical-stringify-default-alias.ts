import { createFixture } from '../src/types'

/**
 * A stringified `&&` / `||` over a boolean prop read through a defaulted
 * body destructure (`const { on = false } = props`, #3443): the local is a
 * boolean whatever the caller passes, so it prints `true` / `false` like
 * the prop itself.
 */
export const fixture = createFixture({
  id: 'boolean-logical-stringify-default-alias',
  description: 'A stringified && / || over a defaulted body-destructured boolean prop renders true / false',
  source: `
'use client'
export function BooleanLogicalStringifyDefaultAlias(props: { on?: boolean; off: boolean }) {
  const { on = false } = props
  return <p>{String(on && !props.off)}|{\`\${props.off || on}\`}</p>
}
`,
  props: { on: true, off: false },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/--></p>
  `,
})
