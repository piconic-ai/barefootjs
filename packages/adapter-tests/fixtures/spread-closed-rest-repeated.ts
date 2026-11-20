import { createFixture } from '../src/types'

/**
 * A literal `title` followed by the same closed rest spread twice, once with
 * an open spread between them. Neither rest carries `title` (it is
 * optional), so the literal is the last write that happened and renders
 * once.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`) for the first
 * element: the Hono reference writes the second rest's expansion as
 * `title={rest.title}`, an explicit `undefined` that replaces the literal,
 * so it renders no `title` (limitation `closed-rest-after-open-spread-omitted-key`).
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
  return (
    <div>
      <p title="fallback" {...rest} {...bag()} {...rest}>a</p>
      <p title="fallback" {...rest} {...rest}>b</p>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" title="fallback">a</p>
      <p title="fallback">b</p>
    </div>
  `,
})
