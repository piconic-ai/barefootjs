import { createFixture } from '../src/types'

/**
 * The parameter-form twin of `destructure-default-body-renamed-callback`
 * (`function C({ b: local = ['y', ''].filter((x) => x !== '') })`): both
 * forms read the prop with its default in the client template.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-renamed-callback',
  description: 'A renamed parameter destructure default holding a callback renders its value when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultParamRenamedCallback({ b: local = ['y', ''].filter((x) => x !== '') }: { b?: string[] }) {
  return <p>{local.length}</p>
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
