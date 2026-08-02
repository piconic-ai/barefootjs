import { createFixture } from '../src/types'

/**
 * Controlled radio group: `checked={sig() === value}` per radio.
 * Same boolean-attribute contract as `controlled-checkbox-checked`,
 * plus the comparison-derived form that real radio groups use (the
 * per-option shape `select-option-selected` pins for `<option>`).
 */
export const fixture = createFixture({
  id: 'controlled-radio-checked',
  description: 'Controlled radio group SSRs checked on the matching radio only',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function SizePicker() {
  const [size, setSize] = createSignal('md')
  return (
    <fieldset>
      <input type="radio" name="size" value="sm" checked={size() === 'sm'} onChange={() => setSize('sm')} />
      <input type="radio" name="size" value="md" checked={size() === 'md'} onChange={() => setSize('md')} />
    </fieldset>
  )
}
`,
  expectedHtml: `
    <fieldset bf-s="test">
      <input type="radio" name="size" value="sm" bf="s0">
      <input type="radio" name="size" value="md" checked bf="s1">
    </fieldset>
  `,
})
