import { createFixture } from '../src/types'

/**
 * A literal `title`, then the same closed rest spread twice with an open
 * bag between them; the caller omits `title`. With an empty bag the literal
 * is the last write; with a bag carrying `title` the bag's value is. Each
 * element renders `title` once.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`): the Hono reference
 * writes the later rest's omitted key as an explicit `undefined`, which
 * replaces the earlier write, so it renders no `title` (limitation
 * `closed-rest-repeated`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated-around-bag',
  description: 'A literal before a closed rest spread repeated around an open bag renders the last write that happened, once',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { title?: string }
export function SpreadClosedRestRepeatedAroundBag({ ...rest }: P) {
  const [bag] = createSignal<Record<string, string>>({})
  const [mid] = createSignal<Record<string, string>>({ title: 'middle' })
  return (
    <div>
      <p title="fallback" {...rest} {...bag()} {...rest}>a</p>
      <p title="fallback" {...rest} {...mid()} {...rest}>b</p>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" title="fallback">a</p>
      <p bf="s1" title="middle">b</p>
    </div>
  `,
})
