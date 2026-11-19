import { createFixture } from '../src/types'

/**
 * `body-statement-write-direct-read` deferred to the client via
 * `/* @client *\/`, one of the two escapes its BF101 names: the server renders
 * an empty slot and no attribute, and the client evaluates both positions
 * after its init ran `local.push('z')`, so it shows `2`.
 */
export const fixture = createFixture({
  id: 'body-statement-write-direct-read-client',
  description: 'A binding a body statement writes, read by the markup under /* @client */',
  source: `
'use client'
export function BodyStatementWriteDirectReadClient() {
  const local = ['y']
  local.push('z')
  return <p data-n={/* @client */ local.length}>{/* @client */ local.length}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0--><!--/--></p>
  `,
})
