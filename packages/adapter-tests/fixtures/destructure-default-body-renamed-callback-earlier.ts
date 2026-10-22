import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default filters an earlier binding with a
 * callback (`const { a, b: local = a.filter((x) => x !== '') } = props`):
 * an omitted `b` takes the filtered `a`.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-callback-earlier',
  description: 'A renamed body destructure default filtering an earlier binding with a callback takes the filtered array',
  source: `
'use client'
export function DestructureDefaultBodyRenamedCallbackEarlier(props: { a: string[]; b?: string[] }) {
  const { a, b: local = a.filter((x) => x !== '') } = props
  return <p>{local.length}</p>
}
`,
  props: { a: ['x', '', 'y'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { a: ['x', '', 'y'], b: ['p'] } },
    { name: 'b-empty', props: { a: ['x', '', 'y'], b: [] } },
  ],
})
