import { createFixture } from '../src/types'

/**
 * #3975: the shadowing sibling of `module-helper-reads-module-const`. The
 * component declares its own `V`, which hides the module `V` inside the
 * component only; `mk` still reads the module one. The CSR template reads
 * `mk` from the module-scope replica. A template adapter refuses the read
 * (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-shadowed',
  description: 'a module helper reading a module const that a component const hides still reads the module const on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperReadsModuleConstShadowed() {
  const V = 'w'
  return <p>{B.k}{V}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">vw</p>
  `,
})
