import { createFixture } from '../src/types'

/**
 * `callback-index-param` deferred to the client via `/* @client *\/`, the escape its
 * diagnostic suggests.
 */
export const fixture = createFixture({
  id: 'callback-index-param-client',
  description: 'A `.map()` callback reading its index, deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function CallbackIndexParamClient() {
  const [items, setItems] = createSignal<string[]>(['a', 'b'])
  return <p>{/* @client */ items().map((x, i) => \`\${i}:\${x}\`).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
