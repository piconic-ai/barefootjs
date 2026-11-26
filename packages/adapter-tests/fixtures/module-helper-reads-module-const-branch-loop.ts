import { createFixture } from '../src/types'

/**
 * #3975: the position sibling of `module-helper-reads-module-const`. The
 * read decides a conditional (the CSR template used to evaluate it as
 * `undefined` and render the false branch) and renders in each loop row. A
 * template adapter refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-branch-loop',
  description: 'a const built by a module helper reading a module const decides a branch and renders in loop rows on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperReadsModuleConstBranchLoop() {
  return (
    <ul>
      {B.k === 'v' ? <li>yes</li> : <li>no</li>}
      {[1, 2].map(i => <li key={i}>{B.k}{i}</li>)}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li>yes</li>
      <li data-key="1">v<!--bf:s0-->1<!--/--></li>
      <li data-key="2">v<!--bf:s0-->2<!--/--></li>
    </ul>
  `,
})
