import { createFixture } from '../src/types'

/**
 * A stringified `&&` / `||` mixing a boolean prop with a computed boolean
 * renders `true` (#3443): `String(props.on && !props.off)` and a template
 * literal over `props.off || props.on === true`, and a boolean signal with
 * a boolean prop. JS returns the last evaluated operand, a boolean either
 * way. A non-boolean operand (`props.name || 'x'`) keeps its value.
 */
export const fixture = createFixture({
  id: 'boolean-logical-stringify',
  description: 'A stringified && / || over a boolean prop and a computed boolean renders true / false',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function BooleanLogicalStringify(props: { on: boolean; off: boolean; name: string }) {
  const [flag] = createSignal(false)
  return <p>{String(props.on && !props.off)}|{\`\${props.off || props.on === true}\`}|{String(flag() || props.off)}|{String(props.name || 'x')}</p>
}
`,
  props: { on: true, off: false, name: '' },
  expectedHtml: `
    <p bf-s="test" bf="s4"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/-->|<!--bf:s2-->false<!--/-->|<!--bf:s3-->x<!--/--></p>
  `,
})
