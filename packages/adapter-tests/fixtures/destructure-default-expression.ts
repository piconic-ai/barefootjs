import { createFixture } from '../src/types'

/**
 * A destructure default that reads an earlier param inside an expression
 * (`{ off = false, on = !off }`), next to a rest pattern: the omitted prop
 * takes the expression over the earlier prop's value, and the rest bag
 * still forwards what is left.
 */
export const fixture = createFixture({
  id: 'destructure-default-expression',
  description: 'A destructure default negating an earlier param, beside a rest spread, renders the negated value',
  source: `
'use client'
export function DestructureDefaultExpression({ off = false, on = !off, ...rest }: { off?: boolean; on?: boolean; title?: string }) {
  return <p {...rest}>{String(on)}</p>
}
`,
  props: { off: true, title: 't' },
  expectedHtml: `
    <p bf-s="test" bf="s1" title="t"><!--bf:s0-->false<!--/--></p>
  `,
})
