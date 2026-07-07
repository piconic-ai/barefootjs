import { createFixture } from '../src/types'

/**
 * `<select>` whose `<option>`s derive `selected` from a comparison
 * against a signal (`selected={value() === 'b'}`). `selected` is an
 * HTML boolean attribute driven per-option by an equality test — the
 * false options must OMIT it, and only the matching option carries it.
 */
export const fixture = createFixture({
  id: 'select-option-selected',
  description: 'Per-option selected={value() === ...} boolean derivation',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function SelectOptionSelected() {
  const [value, setValue] = createSignal('b')
  return (
    <select>
      <option value="a" selected={value() === 'a'}>Alpha</option>
      <option value="b" selected={value() === 'b'}>Beta</option>
      <option value="c" selected={value() === 'c'}>Gamma</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test">
      <option bf="s0" value="a">Alpha</option>
      <option bf="s1" selected value="b">Beta</option>
      <option bf="s2" value="c">Gamma</option>
    </select>
  `,
})
