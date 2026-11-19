import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-object-spread-unresolved-call`: the same read,
 * marked `/* @client *\/`, so it is evaluated in the browser instead of
 * refusing SSR (#3944).
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-client',
  description: 'a /* @client */ read of a module const that spreads a call defers to the browser',
  source: `
'use client'
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedClient() {
  return <p>{/* @client */ B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})
