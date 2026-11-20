import { createFixture } from '../src/types'

/**
 * A literal `title` followed by the same closed rest spread twice: with an
 * empty open bag between them, with none, and with an open bag that carries
 * `title`. The caller omits the optional `title`, so the rest never writes
 * it: the literal is the last write in the first two elements, and the
 * middle bag's value in the third. Each renders `title` once.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`) for the third
 * element: the Hono reference writes the second rest's expansion as an
 * explicit attribute that evaluates to `undefined`, which replaces the bag's
 * `title`, so it renders none (limitation
 * `closed-rest-after-open-spread-omitted-key`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-repeated',
  description: 'A literal before a closed rest spread twice survives when no spread carries its key',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type P = { title?: string }
export function SpreadClosedRestRepeated({ ...rest }: P) {
  const [bag] = createSignal<Record<string, string>>({})
  const [mid] = createSignal<Record<string, string>>({ title: 'middle' })
  return (
    <div>
      <p title="fallback" {...rest} {...bag()} {...rest}>a</p>
      <p title="fallback" {...rest} {...rest}>b</p>
      <p title="fallback" {...rest} {...mid()} {...rest}>c</p>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" title="fallback">a</p>
      <p title="fallback">b</p>
      <p bf="s1" title="middle">c</p>
    </div>
  `,
})
