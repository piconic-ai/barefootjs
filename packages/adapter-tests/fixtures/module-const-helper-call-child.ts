import { createFixture } from '../src/types'

/**
 * #3952: the read of `module-const-helper-call-inlined` in a stateless child
 * from another file (`const B = mk('v')` read by `<Label />`). The child's
 * client module is compiled on its own, so only its template-only module can
 * declare the `mk` its template inlines. A template adapter refuses the
 * child's read (BF101), as for `module-const-helper-call-inlined`.
 */
export const fixture = createFixture({
  id: 'module-const-helper-call-child',
  description: 'a stateless child file reading a module const initialized by a module helper call renders on a client mount (#3952)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
import { Label } from './label'
export function ModuleConstHelperCallChild() {
  return <p><Label /></p>
}
`,
  components: {
    './label.tsx': `
'use client'
const mk = (s: string) => ({ k: s })
const B = mk('v')
export function Label() {
  return <span>{B.k}</span>
}
`,
  },
  expectedHtml: `
    <p bf-s="test"><span bf-s="test_s0">v</span></p>
  `,
})
