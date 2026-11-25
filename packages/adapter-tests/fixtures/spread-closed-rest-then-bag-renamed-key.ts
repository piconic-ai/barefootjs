import { createFixture } from '../src/types'

/**
 * A literal `crossOrigin`, a closed rest spread that omits it, then an open
 * bag carrying `crossOrigin`. The bag's value is the last write, so the
 * element renders one `crossorigin="use-credentials"`. The literal is folded
 * into the rest's expansion as its fallback, which is guarded by the bag
 * keys the adapter's spread helper writes as `crossorigin`: Pebble renames
 * `crossOrigin` to it, so the fallback yields there; the helpers that write
 * `cross-origin` (limitation `spread-bag-camel-key-name`) keep it.
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-then-bag-renamed-key',
  description: 'An open bag after a closed rest spread displaces the folded literal only where it writes the same attribute',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { crossOrigin?: string }
export function SpreadClosedRestThenBagRenamedKey({ ...rest }: P) {
  const [cors] = createSignal<Record<string, string>>({ crossOrigin: 'use-credentials' })
  return <img crossOrigin="anonymous" {...rest} {...cors()} />
}
`,
  props: {},
  expectedHtml: `
    <img bf-s="test" bf="s0" crossorigin="use-credentials">
  `,
})
