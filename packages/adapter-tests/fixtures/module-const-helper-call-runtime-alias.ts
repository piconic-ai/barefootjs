import { createFixture } from '../src/types'

/**
 * #3952: the module helper of `module-const-helper-call-spread-inlined`
 * calls a runtime export imported under an alias (`untrack as read`). The
 * template-only client module declares `mk`, so it must also keep the
 * aliased import `mk`'s body reads; it used to import only the runtime
 * helpers the compiler itself calls, and a client mount threw
 * `ReferenceError: read is not defined`. A template adapter refuses the
 * read (BF101), as for `module-const-helper-call-inlined`.
 */
export const fixture = createFixture({
  id: 'module-const-helper-call-runtime-alias',
  description: 'a module helper reading an aliased runtime import (`untrack as read`) keeps the import in a template-only client module (#3952)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
import { untrack as read } from '@barefootjs/client'
const mk = (s: string) => ({ k: read(() => s) })
const B = mk('v')
export function ModuleConstHelperCallRuntimeAlias() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
