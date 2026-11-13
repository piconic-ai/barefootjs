import { createFixture } from '../src/types'

/**
 * A signal seeded from a read of a key only a literal const's prototype has
 * (`R.toString`, a function in JS), read from a server-rendered position.
 * The seed is computed apart from the position, where no emitter spells the
 * read, so the shared pass refuses it (BF101).
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-signal-seed',
  description: 'a signal seeded from an inherited const key read reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-value-client' }],
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ModuleConstInheritedKeySignalSeed() {
  const R = { k: 'v' }
  const [s, setS] = createSignal(R.toString ? 'y' : 'n')
  return <p onClick={() => setS('z')}>{s()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->y<!--/--></p>
  `,
})
