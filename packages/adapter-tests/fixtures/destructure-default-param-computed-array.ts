import { createFixture } from '../src/types'

/**
 * A parameter destructure whose default computes an array from an earlier
 * binding (`{ a, b = a.slice(1) }`): an omitted `b` takes the sliced `a`.
 * The parameter twin of `destructure-default-body-renamed-computed-array`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-computed-array',
  description: 'A parameter destructure default computing an array from an earlier binding takes the computed array',
  source: `
export function DestructureDefaultParamComputedArray({ a, b = a.slice(1) }: { a: string[]; b?: string[] }) {
  return <p>{b.length}</p>
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
