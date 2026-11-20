import { createFixture } from '../src/types'

/**
 * #3952: the spread sibling of `module-const-helper-call-inlined`
 * (`const B = { ...mk('v') }`), with `mk` a `function` declaration that
 * calls a second module helper. The CSR template inlines
 * `({ ...mk('v') }).k`, so the client module declares `mk` and, through
 * `mk`'s body, `wrap`. A template adapter refuses the read (BF101), as
 * for any spread of a call (`module-const-object-spread-unresolved-call`).
 */
export const fixture = createFixture({
  id: 'module-const-helper-call-spread-inlined',
  description: 'a module const spreading a module helper call (`{ ...mk(\'v\') }`) renders on a client mount (#3952)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-object-spread-unresolved-client' }],
  source: `
'use client'
const wrap = (s: string) => s
function mk(s: string) {
  return { k: wrap(s) }
}
const B = { ...mk('v') }
export function ModuleConstHelperCallSpreadInlined() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
