import { createFixture } from '../src/types'

/**
 * A prop named by a reserved word (`default`) that only a click handler
 * reads. The client-JS reference graph must still see `props.default` as a
 * use of the prop, or the server stops serializing it into the hydration
 * props and the handler reads `undefined` (#3536 review).
 */
export const fixture = createFixture({
  id: 'client-handler-keyword-prop',
  description: 'A reserved-word prop read only by a handler is serialized for hydration (#3536)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function KeywordProp(props: { default: number; label: string }) {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(props.default)}>{props.label}{count()}</button>
}
`,
  props: { default: 5, label: 'n' },
})
