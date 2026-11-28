import { createFixture } from '../src/types'

/**
 * A component-scope array const reading a parameter-destructured prop whose
 * default is an array (`{ b = ['y'] }`, `const local = [b, 'z']`): an omitted
 * `b` reads the default, a non-empty array. The client template binds the
 * prop with its default once and the inlined const reads that binding.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-array-const',
  description: 'An inlined array const reading a parameter-destructured prop with an array default applies the default when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultParamInlinedArrayConst({ b = ['y'] }: { b?: string[] }) {
  const local = [b, 'z']
  return <p>{local[0] ? 'some' : 'none'}|{local.length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0-->some<!--bf-cond-end:s0-->|<!--bf:s1-->2<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p'] } },
  ],
})
