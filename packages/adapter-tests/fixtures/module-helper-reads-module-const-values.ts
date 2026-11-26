import { createFixture } from '../src/types'

/**
 * #3975: the value sibling of `module-helper-reads-module-const`. The helper
 * reads an object const, an array const and a number const, and builds a
 * string, a number and a boolean from them. A template adapter refuses the
 * read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-values',
  description: 'a zero-param module helper reading module object, array and number consts renders on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const T = { a: 'v' }
const L = ['w']
const N = 2
const mk = () => ({ k: T.a + L[0], n: N + 1, on: N > 1 })
const B = mk()
export function ModuleHelperReadsModuleConstValues() {
  return <p>{B.k}-{B.n}-{String(B.on)}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">vw-3-<!--bf:s0-->true<!--/--></p>
  `,
})
