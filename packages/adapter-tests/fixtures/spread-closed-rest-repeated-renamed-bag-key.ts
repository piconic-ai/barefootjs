import { createFixture } from '../src/types'

/**
 * A literal `crossOrigin`, a closed rest spread that omits it, an open bag
 * carrying `crossOrigin`, and the rest again. The bag's value is the last
 * write, so the element renders one `crossorigin="use-credentials"`.
 * Whether the bag displaces the literal depends on the attribute the
 * adapter's spread helper writes the bag key as: Pebble writes
 * `crossorigin`, the same attribute; the helpers that kebab-case it write
 * `cross-origin` (limitation `spread-bag-camel-key-name`), so the literal
 * stays there.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-renamed-bag-key',
  description: 'An open bag between two closed rest spreads displaces a literal only where it writes the same attribute',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { crossOrigin?: string }
export function SpreadClosedRestRepeatedRenamedBagKey({ ...rest }: P) {
  const [cors] = createSignal<Record<string, string>>({ crossOrigin: 'use-credentials' })
  return <img crossOrigin="anonymous" {...rest} {...cors()} {...rest} />
}
`,
  props: {},
  expectedHtml: `
    <img bf-s="test" bf="s0" crossorigin="use-credentials">
  `,
})
