import { createFixture } from '../src/types'

/**
 * A method call no template lowers, outside any higher-order callback:
 * `s().localeCompare('m')` in text and in an attribute. Every template
 * adapter used to fall back to the receiver path, which dropped the call and
 * its argument and rendered a read of the method name (empty), or, on Go, a
 * method call on a plain string field. Each now refuses with BF101, as the
 * same call inside a filter predicate already did (#3493).
 */
export const fixture = createFixture({
  id: 'unlowered-method-call',
  description: 'A method call outside the catalogue, outside a callback, refuses (BF101) instead of rendering a property read (#3493)',
  escapes: [
    { kind: 'prop-precompute', fixture: 'unlowered-method-call-precomputed' },
    { kind: 'client-directive', fixture: 'unlowered-method-call-client' },
  ],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function LocaleOrder() {
  const [s] = createSignal('z')
  return <p data-order={s().localeCompare('m')}>{s().localeCompare('m')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1" data-order="1"><!--bf:s0-->1<!--/--></p>
  `,
})
