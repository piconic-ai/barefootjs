import { createFixture } from '../src/types'

/**
 * A boolean reaching an output through `??` stringifies as JS does
 * (`"false"` / `"true"`): in an attribute, a ternary branch, an `&&` /
 * `||` operand, a template literal, string concatenation, a
 * `boolean | string` child prop and a loop row, over
 * a destructured prop and a boolean signal. Perl has no boolean type, so
 * the Perl adapters must not print a decoded JSON boolean as `0` / `1`;
 * and Go's truthiness-based `or` must not replace a signal holding `false`.
 */
export const fixture = createFixture({
  id: 'nullish-boolean-output-positions-destructured',
  description: 'A boolean operand of ?? prints true / false in attributes, template literals and concatenation',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { FlagLabel } from './flag-label'
export function NullishBooleanOutputPositionsDestructured({ off, on, missing, items }: { off?: boolean; on?: boolean; missing?: boolean; items: string[] }) {
  const [flag] = createSignal<boolean | undefined>(false)
  return (
    <div data-off={off ?? 'none'} data-on={on ?? 'none'} data-missing={missing ?? 'none'} data-signal={flag() ?? 'none'} data-pick={on ? (off ?? 'none') : 'x'} data-and={flag() && (off ?? 'none')} data-or={on || 'none'} data-tpl={\`v=\${off ?? 'none'}\`} data-cat={'v=' + (off ?? 'none')}>
      <span>{\`\${missing ?? 'none'}\`}</span>
      <span>{\`\${off ?? 'none'}|\${on ?? 'none'}|\${flag() ?? 'none'}\`}</span>
      <span>{'v=' + (off ?? 'none')}</span>
      <span>{on ? \`\${off ?? 'none'}\` : 'x'}</span>
      <FlagLabel value={off ?? 'none'} />
      <ul>{items.map(item => <li key={item} data-v={off ?? 'none'}>{item}:{\`\${off ?? 'none'}\`}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './flag-label.tsx': `
export function FlagLabel({ value }: { value: boolean | string }) {
  return <i data-v={value}>{\`\${value}\`}</i>
}
`,
  },
  props: { off: false, on: true, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test" bf="s14" data-and="false" data-cat="v=false" data-missing="none" data-off="false" data-on="true" data-or="true" data-pick="false" data-signal="false" data-tpl="v=false">
      <span bf="s1"><!--bf:s0-->none<!--/--></span>
      <span bf="s3"><!--bf:s2-->false|true|false<!--/--></span>
      <span bf="s5"><!--bf:s4-->v=false<!--/--></span>
      <span bf="s8"><!--bf-cond-start:s6--><!--bf:s7-->false<!--/--><!--bf-cond-end:s6--></span>
      <i bf-s="test_s9" bf="s1" data-v="false"><!--bf:s0-->false<!--/--></i>
      <ul bf="s13">
        <li bf="s12" data-key="a" data-v="false"><!--bf:s10-->a<!--/-->:<!--bf:s11-->false<!--/--></li>
        <li bf="s12" data-key="b" data-v="false"><!--bf:s10-->b<!--/-->:<!--bf:s11-->false<!--/--></li>
      </ul>
    </div>
  `,
})
