import { createFixture } from '../src/types'

/**
 * An inlined const reading parameter-destructured props whose defaults carry
 * source text of their own: a string default spelling another prop's name
 * (`s = 'x a'` beside `a`) and a default whose callback parameter shares a
 * component const's name (`t = ['q'].map((x) => …)` beside `const x`). The client
 * template (taken here because of the memo) applies each default with its
 * text as written.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-default-text',
  description: 'Inlined consts reading defaulted parameter props keep each default text as written in the client template',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultParamInlinedConstDefaultText({ a = 'A', s = 'x a', t = ['q'].map((x) => x + '!').join('') }: { a?: string; s?: string; t?: string }) {
  const x = 'k'
  const pair = [s, a, t, x]
  const label = createMemo(() => a + '?')
  return <p>{label()}|{pair[0]}|{pair[1]}|{pair[2]}|{pair[3]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s5"><!--bf:s0-->A?<!--/-->|<!--bf:s1-->x a<!--/-->|<!--bf:s2-->A<!--/-->|<!--bf:s3-->q!<!--/-->|<!--bf:s4-->k<!--/--></p>
  `,
  dataPoints: [
    { name: 'strings-present', props: { a: 'P', s: 'Q', t: 'T' } },
  ],
})
