import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-helper-call-inlined`: the same read, marked
 * `/* @client *\/`, so it is evaluated in the browser instead of refusing
 * SSR (#3952). The client module declares `B` in init and `mk` at module
 * level.
 */
export const fixture = createFixture({
  id: 'module-const-helper-call-client',
  description: 'a /* @client */ read of a module const initialized by a module helper call defers to the browser',
  source: `
'use client'
const mk = () => ({ k: 'v' })
const B = mk()
export function ModuleConstHelperCallClient() {
  return <p>{/* @client */ B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})
