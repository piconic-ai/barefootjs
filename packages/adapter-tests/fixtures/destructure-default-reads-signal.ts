import { createFixture } from '../src/types'

/**
 * A body destructure default that reads a signal through a component const
 * (`const L = s() + '!'`, `{ b = L }`). A template applies a default from
 * the props alone, before any signal has a value, so it has nothing to
 * compute this one from: refused (BF101) instead of rendering `b` empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-reads-signal',
  description: 'A destructure default reading a signal through a const is refused on the template adapters',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function DestructureDefaultReadsSignal(props: { b?: string }) {
  const [s] = createSignal('q')
  const L = s() + '!'
  const { b = L } = props
  return <p>{b}</p>
}
`,
  props: {},
  escapes: [{ kind: 'client-directive', fixture: 'destructure-default-reads-signal-client' }],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->q!<!--/--></p>
  `,
})
