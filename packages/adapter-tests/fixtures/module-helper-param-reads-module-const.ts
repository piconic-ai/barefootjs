import { createFixture } from '../src/types'

/**
 * #3975, the parameter sibling of `module-helper-reads-module-const`: `mk`
 * takes a parameter, so the CSR template has no form for it and renders
 * `B.k` as `''` on a client mount (CSR-skipped: the server-side refusal
 * entry lists this fixture). A template adapter refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-param-reads-module-const',
  description: 'a const built by a module helper with a parameter that reads another module const (`mk(\'a\')`) renders client-side',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = (s: string) => ({ k: s + V })
const B = mk('a')
export function ModuleHelperParamReadsModuleConst() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">av</p>
  `,
})
