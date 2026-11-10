import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-inherited-key`: the same reads, marked
 * `/* @client *\/`, so they are evaluated in the browser instead of
 * refusing SSR.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-client',
  description: 'a /* @client */ read of a module const key only its prototype has defers to the browser',
  source: `
'use client'
const QS = ['a', 'b']
const REC = { k: 'v' }
export function ModuleConstInheritedKeyClient() {
  return (
    <p>
      {/* @client */ REC['toString'] ? 'y' : 'n'}|{/* @client */ QS['map'] ? 'y' : 'n'}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf-cond-start:s0--><!--bf-cond-end:s0-->|<!--bf-cond-start:s1--><!--bf-cond-end:s1--></p>
  `,
})
