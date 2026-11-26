import { createFixture } from '../src/types'

/**
 * An array const reading a parameter-destructured prop with a literal default
 * (`{ b = 'y' }`, `const local = [b.length, 'z']`), read through a memo and
 * child props: the client template substitutes each of them through the
 * const, and an omitted `b` reads its default there as a direct read does.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-reactive',
  description: 'An inlined array const reading a literal-defaulted parameter prop applies the default through a memo and child props',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
import { InlinedConstChild } from './inlined-const-child'
export function DestructureDefaultParamInlinedConstReactive({ b = 'y' }: { b?: string }) {
  const local = [b.length, 'z']
  const total = createMemo(() => local.length + 1)
  return (
    <div>
      <p>{total()}</p>
      <InlinedConstChild n={local.length} label={b} />
    </div>
  )
}
`,
  components: {
    './inlined-const-child.tsx': `
export function InlinedConstChild({ n, label }: { n: number; label: string }) {
  return <i>{n}|{label}</i>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s1"><!--bf:s0-->3<!--/--></p>
      <i bf-s="test_s2" bf="s2"><!--bf:s0-->2<!--/-->|<!--bf:s1-->y<!--/--></i>
    </div>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: 'pqr' } },
  ],
})
