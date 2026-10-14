import { createFixture } from '../src/types'

/**
 * A `.map()` callback reading its index parameter. No template evaluator binds
 * a callback's index (or array) parameter, so before #3477 the DSL adapters
 * read `i` from the enclosing template scope instead, silently. The support
 * gate now refuses it (`unboundCallbackParamRead`): BF101.
 * Hono / CSR run the callback as JS; a DSL adapter that cannot lower it
 * declares the diagnostic in its `conformancePins`.
 */
export const fixture = createFixture({
  id: 'callback-index-param',
  description: 'A `.map()` callback reading its index — JS-runtime faithful, DSL diagnostic',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function CallbackIndexParam() {
  const [items, setItems] = createSignal<string[]>(['a', 'b'])
  return <p>{items().map((x, i) => \`\${i}:\${x}\`).join(',')}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->0:a,1:b<!--/--></p>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'callback-index-param-client' }],
})
