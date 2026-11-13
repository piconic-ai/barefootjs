import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-inherited-key-signal-seed`, `-memo-const`
 * and `-memo-method`: a signal seed, a const a memo returns and a memo
 * calling an object const method, each reading a key only a literal const's
 * prototype has, and each read only from a `/* @client *\/` position. The server render never computes them, so the
 * component compiles on every template adapter.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-value-client',
  description: 'a signal seed and memos reading an inherited const key, read only from /* @client */, defer to the browser',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function ModuleConstInheritedKeyValueClient() {
  const R = { k: 'v' }
  const H = { safe: 'ok', get: () => (R.toString ? 'y' : 'n') }
  const [s, setS] = createSignal(R.toString ? 'y' : 'n')
  const c = R.toString ? 'y' : 'n'
  const viaConst = createMemo(() => c)
  const viaMethod = createMemo(() => H.get())
  return (
    <p onClick={() => setS('z')}>
      {/* @client */ s()}|{/* @client */ viaConst()}|{/* @client */ viaMethod()}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/--></p>
  `,
})
