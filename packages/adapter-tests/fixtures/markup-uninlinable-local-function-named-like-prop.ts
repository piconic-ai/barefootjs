import { createFixture } from '../src/types'

/**
 * Markup calls a local function named like a typed prop whose body is more
 * than one `return`: a template cannot inline it, and read as a getter the
 * call would render the supplied prop (`{ value: 9 }`) where Hono renders the
 * function's `1`, so every template adapter refuses it (BF101).
 */
export const fixture = createFixture({
  id: 'markup-uninlinable-local-function-named-like-prop',
  description: 'Markup calling a local function named like a typed prop that a template cannot inline refuses instead of rendering the prop',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MarkupUninlinableLocalFunctionNamedLikeProp(props: { value?: number }) {
  function value() {
    const one = 1
    return one
  }
  const [n] = createSignal(0)
  return <p>{value()}|{n()}</p>
}
`,
  props: { value: 9 },
  escapes: [{ kind: 'client-directive', fixture: 'markup-uninlinable-local-function-named-like-prop-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->0<!--/--></p>
  `,
})
