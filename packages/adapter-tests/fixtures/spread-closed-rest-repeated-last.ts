import { createFixture } from '../src/types'

/**
 * Sibling of `spread-closed-rest-repeated` where the caller passes `title`:
 * the last closed rest spread is the last write, so `title` renders once,
 * with the rest's value, with an empty open bag between the two rests and
 * with none.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-last',
  description: 'A closed rest spread repeated around an empty open bag renders the rest value once',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { title?: string }
export function SpreadClosedRestRepeatedLast({ ...rest }: P) {
  const [bag] = createSignal<Record<string, string>>({})
  return (
    <div>
      <p title="fallback" {...rest} {...bag()} {...rest}>a</p>
      <p title="fallback" {...rest} {...rest}>b</p>
    </div>
  )
}
`,
  props: { title: 'last' },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" title="last">a</p>
      <p title="last">b</p>
    </div>
  `,
})
