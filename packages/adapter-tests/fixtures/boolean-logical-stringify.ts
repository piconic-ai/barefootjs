import { createFixture } from '../src/types'

/**
 * A stringified `&&` / `||` mixing a boolean prop with a computed boolean
 * renders `true` (#3443): `String(props.on && !props.off)` and a template
 * literal over `props.off || props.on === true`. JS returns the last
 * evaluated operand, a boolean either way.
 */
export const fixture = createFixture({
  id: 'boolean-logical-stringify',
  description: 'A stringified && / || over a boolean prop and a computed boolean renders true / false',
  source: `
'use client'
export function BooleanLogicalStringify(props: { on: boolean; off: boolean }) {
  return <p>{String(props.on && !props.off)}|{\`\${props.off || props.on === true}\`}</p>
}
`,
  props: { on: true, off: false },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/--></p>
  `,
})
