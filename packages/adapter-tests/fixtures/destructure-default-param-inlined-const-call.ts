import { createFixture } from '../src/types'

/**
 * A component-scope const reading parameter props whose defaults are calls
 * (`{ label = String(1), parts = 'a-b'.split('-') }`, `const out = [label,
 * parts.length]`): an omitted prop reads its default's result, so the const
 * holds `1` and `2`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-call',
  description: 'An inlined const reading parameter props with call defaults applies each default',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstCall({ label = String(1), parts = 'a-b'.split('-') }: { label?: string; parts?: string[] }) {
  const out = [label, parts.length]
  return <p>{out[0]}|{out[1]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->2<!--/--></p>
  `,
  dataPoints: [
    { name: 'all-present', props: { label: 'L', parts: ['x'] } },
  ],
})
