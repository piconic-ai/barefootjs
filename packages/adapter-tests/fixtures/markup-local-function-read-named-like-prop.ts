import { createFixture } from '../src/types'

/**
 * Markup reads, without calling it, a local function named like a typed
 * prop the body never binds: JS renders nothing for a function, so a
 * supplied colliding prop (`{ value: 9 }`) still renders an empty slot.
 */
export const fixture = createFixture({
  id: 'markup-local-function-read-named-like-prop',
  description: 'Markup reading a local function named like a typed prop without calling it renders nothing, not the prop',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function MarkupLocalFunctionReadNamedLikeProp(props: { value?: number }) {
  function value() {
    return 1
  }
  const [n] = createSignal(0)
  return <p>{value}|{n()}</p>
}
`,
  props: { value: 9 },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0--><!--/-->|<!--bf:s1-->0<!--/--></p>
  `,
})
