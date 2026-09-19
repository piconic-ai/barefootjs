import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `opaque-local-accessor-call`. Deferring the
 * opaque accessor read to the client keeps it out of every SSR template
 * (the slot renders empty on the server and hydration fills it), so no
 * adapter ever has to evaluate `label()` in its own language — the way
 * out of the silent bare-variable lowering the un-escaped fixture pins.
 */
export const fixture = createFixture({
  id: 'opaque-local-accessor-call-client',
  description: 'Local accessor bound to an opaque helper call, read deferred to the client via /* @client */',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function makeLabel() {
  return () => 'ready'
}

export function Widget() {
  const [count, setCount] = createSignal(0)
  const label = makeLabel()
  return (
    <div>
      <span>{/* @client */ label()}</span>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span></span>
      <button bf="s2"><!--bf:s1-->0<!--/--></button>
    </div>
  `,
})
