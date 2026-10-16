import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `unlowered-method-call`: the comparison is
 * deferred to the browser, so the server renders an empty slot and the
 * client runtime fills it at hydration.
 */
export const fixture = createFixture({
  id: 'unlowered-method-call-client',
  description: 'A /* @client */ method call outside the catalogue defers to the browser instead of refusing SSR (#3493)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function LocaleOrder() {
  const [s] = createSignal('z')
  return <p data-order={/* @client */ s().localeCompare('m')}>{/* @client */ s().localeCompare('m')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
