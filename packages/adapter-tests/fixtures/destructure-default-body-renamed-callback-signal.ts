import { createFixture } from '../src/types'

/**
 * The renamed body destructure default holding a callback
 * (`destructure-default-body-renamed-callback`) as a signal seed
 * (`createSignal(local.length)`): an omitted `b` seeds from the filtered
 * array.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-signal',
  description: 'A renamed body destructure default holding a callback seeds a signal with its value',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function DestructureDefaultBodyRenamedCallbackSignal(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  const [n] = createSignal(local.length)
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
