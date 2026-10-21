import { createFixture } from '../src/types'

/**
 * The renamed body destructure default holding a callback
 * (`destructure-default-body-renamed-callback`), read through a memo
 * (`createMemo(() => local.length)`): an omitted `b` takes the filtered
 * array.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-memo',
  description: 'A renamed body destructure default holding a callback, read through a memo, renders its value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultBodyRenamedCallbackMemo(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  const n = createMemo(() => local.length)
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
