import { createFixture } from '../src/types'

/**
 * The un-renamed twin of `destructure-default-body-renamed-callback`
 * (`const { b = ['y', ''].filter((x) => x !== '') } = props`): both forms
 * read the prop with its default in the client template.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-callback',
  description: 'A body destructure default holding a callback renders its value when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultBodyCallback(props: { b?: string[] }) {
  const { b = ['y', ''].filter((x) => x !== '') } = props
  return <p>{b.length}</p>
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
