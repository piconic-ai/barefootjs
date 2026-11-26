import { createFixture } from '../src/types'

/**
 * The body-destructure twin of
 * `destructure-default-param-inlined-const-positions`: consts reading
 * `const { s = 'd', b = ['y'] } = props`, inlined into the client template.
 * An omitted prop reads its default there, as a direct read does.
 */
export const fixture = createFixture({
  id: 'destructure-default-body-inlined-const',
  description: 'Inlined consts reading body-destructured props with defaults apply the default to an omitted prop',
  source: `
'use client'
export function DestructureDefaultBodyInlinedConst(props: { s?: string; b?: string[] }) {
  const { s = 'd', b = ['y'] } = props
  const local = [s, b.length]
  return <p title={local[0]}>{local[0]}|{local[1]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2" title="d"><!--bf:s0-->d<!--/-->|<!--bf:s1-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'present', props: { s: 'S', b: ['p', 'q'] } },
  ],
})
