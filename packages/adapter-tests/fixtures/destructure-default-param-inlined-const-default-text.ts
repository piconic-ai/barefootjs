import { createFixture } from '../src/types'

/**
 * An inlined const reading a parameter-destructured prop whose string default
 * spells another prop's name (`s = 'x a'` beside `a`): the client template
 * (taken here because of the memo) applies the default with its text as
 * written, not with `a` rewritten inside the string.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-default-text',
  description: 'An inlined const reading a string-defaulted parameter prop keeps the default text as written in the client template',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultParamInlinedConstDefaultText({ a = 'A', s = 'x a' }: { a?: string; s?: string }) {
  const x = 'k'
  const pair = [s, a, x]
  const label = createMemo(() => a + '?')
  return <p>{label()}|{pair[0]}|{pair[1]}|{pair[2]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s4"><!--bf:s0-->A?<!--/-->|<!--bf:s1-->x a<!--/-->|<!--bf:s2-->A<!--/-->|<!--bf:s3-->k<!--/--></p>
  `,
  dataPoints: [
    { name: 'strings-present', props: { a: 'P', s: 'Q' } },
  ],
})
