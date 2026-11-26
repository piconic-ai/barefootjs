import { createFixture } from '../src/types'

/**
 * #3975: the module helper behind an inlined const (`const B = mk()`) reads
 * another module const (`V`), so `mk` is not module-scope and the CSR
 * template splices it as `(() => ({ k: ('v') }))()`. The template used to
 * refuse that call and render `B.k` as `''` (the attribute was dropped), so
 * a client mount showed an empty `<p>`. A template adapter refuses the read
 * (BF101): it cannot run `mk` at render time.
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const',
  description: 'a module const initialized by a zero-param module helper that reads another module const renders on a client mount (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperReadsModuleConst() {
  return <p title={B.k}>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" title="v">v</p>
  `,
})
