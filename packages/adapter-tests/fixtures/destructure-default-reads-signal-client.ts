import { createFixture } from '../src/types'

/**
 * The `@client` escape of `destructure-default-reads-signal`: the prop is
 * read on the client only, where its default has the signal to read, so the
 * server leaves the slot empty.
 */
export const fixture = createFixture({
  id: 'destructure-default-reads-signal-client',
  description: 'The /* @client */ escape of a destructure default reading a signal through a const',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function DestructureDefaultReadsSignalClient(props: { b?: string }) {
  const [s] = createSignal('q')
  const L = s() + '!'
  const { b = L } = props
  return <p>{/* @client */ b}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
