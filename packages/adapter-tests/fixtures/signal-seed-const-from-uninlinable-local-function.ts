import { createFixture } from '../src/types'

/**
 * A signal is seeded from a const whose initializer calls a local function a
 * template cannot inline: the signal's server value is the call's `1`, which
 * no template can compute, so every template adapter refuses it (BF101)
 * instead of rendering the signal empty.
 */
export const fixture = createFixture({
  id: 'signal-seed-const-from-uninlinable-local-function',
  description: 'A signal seeded from a const initialized by a local function a template cannot inline refuses',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function SignalSeedConstFromUninlinableLocalFunction() {
  function value() {
    const one = 1
    return one
  }
  const initial = value()
  const [n] = createSignal(initial)
  return <p>{n()}</p>
}
`,
  escapes: [{ kind: 'client-directive', fixture: 'signal-seed-const-from-uninlinable-local-function-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
})
