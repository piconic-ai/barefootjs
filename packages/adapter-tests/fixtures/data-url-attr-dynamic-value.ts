import { createFixture } from '../src/types'

/**
 * A `data-` attribute whose remaining name contains `src`, `uri` or `url`
 * (`data-src`, `data-url`) bound to a dynamic value. The value is plain
 * attribute text like any other `data-*` attribute — never URL-normalized or
 * scheme-filtered; `data-state` alongside it is the control.
 */
export const fixture = createFixture({
  id: 'data-url-attr-dynamic-value',
  description: 'A dynamic value on a data-src / data-url attribute renders as plain attribute text',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DataUrlAttrDynamicValue() {
  const [v] = createSignal('a b')
  const [js] = createSignal('javascript:x')
  return <div data-src={v()} data-url={js()} data-state={v()}>Content</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s0" data-src="a b" data-state="a b" data-url="javascript:x">Content</div>
  `,
})
