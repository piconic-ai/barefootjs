import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated-around-bag` where both the caller
 * and the open bag between the two closed rest spreads carry `title`. The
 * last rest is the last write, so `title` renders once, with the rest's
 * value.
 *
 * The template adapters render the rest's value twice, ahead of the bag's
 * (`title="last" title="last" title="middle"`; a browser reads `last`):
 * limitation `closed-rest-repeated`.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-both',
  description: 'A closed rest spread repeated around an open bag carrying the same key renders the rest value once',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { title?: string }
export function SpreadClosedRestRepeatedBoth({ ...rest }: P) {
  const [mid] = createSignal<Record<string, string>>({ title: 'middle' })
  return <p title="fallback" {...rest} {...mid()} {...rest}>a</p>
}
`,
  props: { title: 'last' },
  expectedHtml: `
    <p bf-s="test" bf="s0" title="last">a</p>
  `,
})
