import { createFixture } from '../src/types'

/**
 * The renamed body destructure default holding a callback read through a
 * memo of a memo (`destructure-default-body-renamed-callback-memo`): an
 * identity memo over the binding, then arithmetic over it in an attribute
 * (a fraction) and a join in text.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-memo-chain',
  description: 'A renamed body destructure default holding a callback, read through a memo of a memo, renders its value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultBodyRenamedCallbackMemoChain(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  const items = createMemo(() => local)
  const half = createMemo(() => items().length / 2)
  return <p title={String(half())}>{items().join(',')}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1" title="0.5"><!--bf:s0-->y<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p', 'q', 'r'] } },
    { name: 'b-empty', props: { b: [] } },
  ],
})
