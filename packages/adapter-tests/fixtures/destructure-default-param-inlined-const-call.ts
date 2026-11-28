import { createFixture } from '../src/types'

/**
 * A component-scope const reading a parameter prop whose default is a call
 * (`{ label = String(1) }`, `const out = [label, label.length]`): an omitted
 * prop reads the call's result, so the const holds `1` and `1`.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-call',
  description: 'An inlined const reading a parameter prop with a call default applies the default',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstCall({ label = String(1) }: { label?: string }) {
  const out = [label, label.length]
  return <p>{out[0]}|{out[1]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/-->|<!--bf:s1-->1<!--/--></p>
  `,
  dataPoints: [
    { name: 'label-present', props: { label: 'LL' } },
  ],
})
