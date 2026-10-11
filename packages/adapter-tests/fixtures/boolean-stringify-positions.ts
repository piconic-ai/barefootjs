import { createFixture } from '../src/types'

/**
 * A boolean stringified in each template position renders `true` / `false`
 * (#3440): `String()` in an attribute and in text, a template literal with a
 * single substitution and with surrounding text, a boolean loop row's key
 * and text, and a boolean signal. Perl has no boolean type, so the Perl
 * adapters must not print a decoded JSON boolean as `1` / `0`.
 */
export const fixture = createFixture({
  id: 'boolean-stringify-positions',
  description: 'A stringified boolean renders true / false in attributes, text, template literals and loop keys',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function BooleanStringifyPositions(props: { on: boolean; off: boolean; flags: boolean[] }) {
  const [open] = createSignal(false)
  return (
    <div data-on={String(props.on)} data-label={\`open:\${open()}\`}>
      <p>{String(props.off)}|{\`\${props.on}\`}|{\`[\${props.off}]\`}|{String(open())}</p>
      <ul>
        {props.flags.map(f => <li key={String(f)}>{String(f)}</li>)}
      </ul>
    </div>
  )
}
`,
  props: { on: true, off: false, flags: [false, true] },
  expectedHtml: `
    <div bf-s="test" bf="s7" data-label="open:false" data-on="true">
      <p bf="s4"><!--bf:s0-->false<!--/-->|<!--bf:s1-->true<!--/-->|<!--bf:s2-->[false]<!--/-->|<!--bf:s3-->false<!--/--></p>
      <ul bf="s6">
        <li data-key="false"><!--bf:s5-->false<!--/--></li>
        <li data-key="true"><!--bf:s5-->true<!--/--></li>
      </ul>
    </div>
  `,
})
