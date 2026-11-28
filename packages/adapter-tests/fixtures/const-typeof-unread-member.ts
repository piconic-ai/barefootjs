import { createFixture } from '../src/types'

/**
 * A component const object literal with a `typeof` member, read only through
 * its other members (#3981): `const o = { kind: typeof props.x, n: 1 }`,
 * `{o.n}` and `const label = o.n`. A template inlines the member it reads, so
 * every adapter renders `1` as Hono does; the refusal of an operator no template
 * lowers reads only the members a template position reaches, and passes this.
 */
export const fixture = createFixture({
  id: 'const-typeof-unread-member',
  description: 'A const object read only through a member without typeof renders that member (#3981)',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ConstTypeofUnreadMember(props: { x: string }) {
  const o = { kind: typeof props.x, n: 1 }
  const label = o.n
  return <p>{o.n}{label}</p>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->1<!--/--><!--bf:s1-->1<!--/--></p>
  `,
})
