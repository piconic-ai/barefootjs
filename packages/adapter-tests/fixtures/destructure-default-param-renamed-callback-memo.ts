import { createFixture } from '../src/types'

/**
 * The parameter-form twin of `destructure-default-body-renamed-callback-memo`
 * (`function C({ b: local = ['y', ''].filter((x) => x !== '') })`, read
 * through `createMemo(() => local.length)`): an omitted `b` takes the
 * filtered array.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-renamed-callback-memo',
  description: 'A renamed parameter destructure default holding a callback, read through a memo, renders its value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultParamRenamedCallbackMemo({ b: local = ['y', ''].filter((x) => x !== '') }: { b?: string[] }) {
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
