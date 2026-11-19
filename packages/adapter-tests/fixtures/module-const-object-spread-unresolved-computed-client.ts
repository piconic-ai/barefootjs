import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-object-spread-unresolved-computed-*`: the same
 * computed read, marked `/* @client *\/`, so it is evaluated in the browser
 * instead of refusing SSR (#3944).
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-unresolved-computed-client',
  description: 'a /* @client */ computed read of a const with an unresolved spread defers to the browser',
  source: `
'use client'
const B = { ...JSON.parse('{"k":"v"}') }
export function ModuleConstObjectSpreadUnresolvedComputedClient({ field }: { field: string }) {
  return <p>{/* @client */ B[field]}</p>
}
`,
  props: { field: 'k' },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
