import { createFixture } from '../src/types'

/**
 * A parameter default naming a module binding (`{ b = fallback }`) beside a
 * body const of the same name (`const fallback = 'local'`): JS resolves the
 * default in parameter scope, so an omitted `b` reads `module`, never the
 * body's `local`. The client template reads the omitted prop without its
 * default (limitation `csr-template-inlined-const-param-default`).
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-scope',
  description: 'A parameter default naming a module binding resolves in parameter scope, not to a same-named body const',
  source: `
'use client'
const fallback = 'module'
export function DestructureDefaultParamInlinedConstScope({ b = fallback }: { b?: string }) {
  const fallback = 'local'
  const local = [b]
  return <p>{local[0]}|{fallback}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->module<!--/-->|<!--bf:s1-->local<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-present', props: { b: 'B' } },
  ],
})
