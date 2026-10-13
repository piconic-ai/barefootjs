import { createFixture } from '../src/types'

/**
 * A stringified `&&` / `||` mixing a boolean prop with a computed boolean
 * renders `true` (#3443): `String(props.on && !props.off)` and a template
 * literal over `props.off || props.on === true`, and a boolean signal with
 * a boolean prop. JS returns the last evaluated operand, a boolean either
 * way. A non-boolean operand (`props.name || 'x'`) keeps its value, and a
 * local constant named like a boolean prop (`shown`) is not the prop.
 */
export const fixture = createFixture({
  id: 'boolean-logical-stringify',
  description: 'A stringified && / || over a boolean prop and a computed boolean renders true / false',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function BooleanLogicalStringify(props: { on: boolean; off: boolean; name: string; shown: boolean }) {
  const [flag] = createSignal(false)
  const shown = 'text'
  return <p>{String(props.on && !props.off)}|{\`\${props.off || props.on === true}\`}|{String(flag() || props.off)}|{String(props.name || 'x')}|{String(shown)}|{String(props.shown && props.on)}</p>
}
`,
  props: { on: true, off: false, name: '', shown: true },
  expectedHtml: `
    <p bf-s="test" bf="s6"><!--bf:s0-->true<!--/-->|<!--bf:s1-->true<!--/-->|<!--bf:s2-->false<!--/-->|<!--bf:s3-->x<!--/-->|<!--bf:s4-->text<!--/-->|<!--bf:s5-->true<!--/--></p>
  `,
})
