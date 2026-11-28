import { createFixture } from '../src/types'

/**
 * The shape of the original report: a component-scope array const reading a
 * member of a parameter prop with an array default (`{ b = ['y'] }`, `const
 * local = [b.length, 'z']`). An omitted `b` reads the default, so the const
 * has two entries; the client template applies the default exactly as the
 * direct `{b.length}` read beside it does.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-member',
  description: 'An inlined array const reading a member of a parameter prop with an array default applies the default',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstMember({ b = ['y'] }: { b?: string[] }) {
  const local = [b.length, 'z']
  return <p>{local.length}|{local[0]}|{b.length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->2<!--/-->|<!--bf:s1-->1<!--/-->|<!--bf:s2-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p', 'q'] } },
  ],
})
