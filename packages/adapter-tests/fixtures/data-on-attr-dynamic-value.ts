import { createFixture } from '../src/types'

/**
 * A `data-` attribute whose remaining name starts with `on` (`data-on`,
 * `data-onset`) bound to a dynamic value. The value is plain attribute text
 * like any other `data-*` attribute; `data-state` alongside it is the
 * control.
 */
export const fixture = createFixture({
  id: 'data-on-attr-dynamic-value',
  description: 'A dynamic value on a data-on* attribute renders as plain attribute text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DataOnAttrDynamicValue() {
  const [mode] = createSignal('x')
  return <div data-on={mode()} data-state={mode()}>Content</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s0" data-on="x" data-state="x">Content</div>
  `,
})
