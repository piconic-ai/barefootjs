import { createFixture } from '../src/types'

/**
 * A signal is seeded from a function a template inlines (`wrap`, a single
 * `return`) that calls one it cannot (`value`): the signal's server value is
 * still the inner call's `1`, so every template adapter refuses it (BF101)
 * instead of rendering the signal empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-wrapped-uninlinable-local-function',
  description: 'A signal seeded through an inlinable wrapper of a local function a template cannot inline refuses',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedWrappedUninlinableLocalFunction() {
  function value() {
    const one = 1
    return one
  }
  function wrap() { return value() }
  const [n] = createSignal(wrap())
  return <p>{n()}</p>
}
`,
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-wrapped-uninlinable-local-function-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
