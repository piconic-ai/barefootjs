import { createFixture } from '../src/types'

/**
 * A hyphenated custom-element tag with a static and a dynamic
 * attribute. Custom elements are lowercase-with-hyphen — an adapter
 * whose tag validation only knows the HTML element list, or whose
 * component-vs-element split keys on something other than the leading
 * character, mis-lowers this.
 */
export const fixture = createFixture({
  id: 'custom-element-tag',
  description: 'Hyphenated custom element with static and signal-bound attributes',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function CustomElementTag() {
  const [theme, setTheme] = createSignal('light')
  return (
    <my-widget widget-id="w1" theme={theme()}>
      <span>slotted</span>
    </my-widget>
  )
}
`,
  expectedHtml: `
    <my-widget bf-s="test" bf="s0" theme="light" widget-id="w1"><span>slotted</span></my-widget>
  `,
})
