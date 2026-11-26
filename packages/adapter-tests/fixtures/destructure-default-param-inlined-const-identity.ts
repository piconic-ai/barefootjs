import { createFixture } from '../src/types'

/**
 * A component-scope const reading a parameter prop with an array default
 * twice (`{ b = [] }`, `const local = [b, b]`), and a later default reading
 * that binding (`{ a = [], c = a }`, `const pair = [a, c]`): JS binds each
 * default once, so both reads are the same value and an omitted prop renders
 * `same`. The client template must not evaluate the default per read.
 */
export const fixture = createFixture({
  id: 'destructure-default-param-inlined-const-identity',
  description: 'An inlined const reading an allocating parameter default twice sees one value',
  source: `
'use client'
export function DestructureDefaultParamInlinedConstIdentity({ b = [], a = [], c = a }: { b?: string[]; a?: string[]; c?: string[] }) {
  const local = [b, b]
  const pair = [a, c]
  return <p>{local[0] === local[1] ? 'same' : 'different'}|{pair[0] === pair[1] ? 'same' : 'different'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0-->same<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->same<!--bf-cond-end:s1--></p>
  `,
})
