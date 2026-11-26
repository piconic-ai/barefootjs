import { createFixture } from '../src/types'

/**
 * A component-scope array const reading a parameter-destructured prop with
 * a default (`{ b = ['y'] }`, `const local = [b.length, 'z']`): the client
 * template inlines the const, and an omitted `b` reads the default there
 * exactly as a direct `{b.length}` read does.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-array-const',
  description: 'An inlined array const reading a parameter-destructured prop with a default applies the default when the prop is omitted',
  source: `
'use client'
export function DestructureDefaultParamInlinedArrayConst({ b = ['y'] }: { b?: string[] }) {
  const local = [b.length, 'z']
  return <p>{local.length}|{local[0]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: ['p', 'q', 'r'] } },
  ],
})
