import { createFixture } from '../src/types'

/**
 * A literal `title`, a closed rest spread, an empty open bag, then the same
 * rest twice more in a row; the caller omits `title`. No spread carries the
 * key, so the literal is the last write and renders once.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`): every expansion of
 * the repeated rest is kept as on main (limitation `closed-rest-repeated`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-after-bag',
  description: 'A literal before a closed rest, an open bag and two more repeats of the rest renders once',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { title?: string }
export function SpreadClosedRestRepeatedAfterBag({ ...rest }: P) {
  const [bag] = createSignal<Record<string, string>>({})
  return <p title="fallback" {...rest} {...bag()} {...rest} {...rest}>a</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s0" title="fallback">a</p>
  `,
})
