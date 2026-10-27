import { createFixture } from '../src/types'

/**
 * The un-renamed twin of `destructure-default-body-renamed-callback-memo`
 * (`const { b = ['y', ''].filter((x) => x !== '') } = props`, read through
 * `createMemo(() => b.length)`): an omitted `b` takes the filtered array.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-callback-memo',
  description: 'A body destructure default holding a callback, read through a memo, renders its value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultBodyCallbackMemo(props: { b?: string[] }) {
  const { b = ['y', ''].filter((x) => x !== '') } = props
  const n = createMemo(() => b.length)
  return <p>{n()}</p>
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p', 'q', 'r'] } },
    { name: 'b-empty', props: { b: [] } },
  ],
})
