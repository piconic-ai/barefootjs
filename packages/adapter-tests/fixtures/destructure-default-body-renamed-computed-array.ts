import { createFixture } from '../src/types'

/**
 * A renamed body destructure whose default computes an array from an
 * earlier binding (`const { a, b: local = a.slice(1) } = props`): an
 * omitted `b` takes the sliced `a`.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-renamed-computed-array',
  description: 'A renamed body destructure default computing an array from an earlier binding takes the computed array',
  source: `
export function DestructureDefaultBodyRenamedComputedArray(props: { a: string[]; b?: string[] }) {
  const { a, b: local = a.slice(1) } = props
  return <p>{local.length}</p>
}
`,
  props: { a: ['x', 'y'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { a: ['x', 'y'], b: ['p', 'q', 'r'] } },
  ],
})
