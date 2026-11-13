import { createFixture } from '../src/types'

/**
 * A signal is seeded from a local function named like a typed prop whose
 * body is more than one `return`: a template cannot compute the seed, which
 * would render empty where Hono renders the function's `1`, so every
 * template adapter refuses it (BF101).
 */
export const fixture = createFixture({
  id: 'signal-seed-uninlinable-local-function-named-like-prop',
  description: 'A signal seeded from a local function named like a typed prop that a template cannot inline refuses',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedUninlinableLocalFunctionNamedLikeProp(props: { value?: number }) {
  function value() {
    const one = 1
    return one
  }
  const [n] = createSignal(value())
  return <p>{n()}</p>
}
`,
  props: { value: 9 },
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-uninlinable-local-function-named-like-prop-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
