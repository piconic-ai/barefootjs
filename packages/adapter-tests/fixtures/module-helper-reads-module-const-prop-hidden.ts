import { createFixture } from '../src/types'

/**
 * #3975: the prop sibling of `module-helper-reads-module-const-shadowed`: a
 * destructured prop named `V` hides the module const inside the component.
 * A template adapter refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-prop-hidden',
  description: 'a module helper reading a module const that a prop hides still reads the module const on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperReadsModuleConstPropHidden({ V = 'p' }: { V?: string }) {
  return <p>{B.k}{V}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf:s0-->v<!--/--><!--bf:s1-->p<!--/--></p>
  `,
})
