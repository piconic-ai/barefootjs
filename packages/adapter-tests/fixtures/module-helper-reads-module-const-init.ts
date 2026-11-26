import { createFixture } from '../src/types'

/**
 * #3975: the init-path sibling of `module-helper-reads-module-const`. The
 * component holds a signal and a handler, so its client module has an init
 * body; the CSR template reads `B.k` through the same applied arrow as the
 * template-only path. A template adapter refuses the read (BF101).
 */
export const fixture = createFixture({
  id: 'module-helper-reads-module-const-init',
  description: 'a const built by a module helper reading a module const renders on a client mount of a component with an init body (#3975)',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-helper-call-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const V = 'v'
const mk = () => ({ k: V })
const B = mk()
export function ModuleHelperReadsModuleConstInit() {
  const [n, setN] = createSignal(0)
  return <button title={B.k} onClick={() => setN(n() + 1)}>{B.k}</button>
}
`,
  expectedHtml: `
    <button bf-s="test" bf="s0" title="v">v</button>
  `,
})
