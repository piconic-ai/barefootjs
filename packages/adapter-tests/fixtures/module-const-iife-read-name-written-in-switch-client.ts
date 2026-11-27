import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-read-name-written-in-switch`: the read of
 * the const is deferred to the browser, so the server renders the text slot
 * empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-read-name-written-in-switch-client',
  description: 'The client-directive escape of module-const-iife-read-name-written-in-switch',
  source: `
'use client'
const value = 'outer'
export function pick(n: number): number {
  switch (n) {
    case 0:
      let value: string
      break
    case 1:
      value = 'shadow'
  }
  return n
}
const B = (() => ({ k: value }))()
export function ModuleConstIifeReadNameWrittenInSwitchClient() {
  return <p>{/* @client */ B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/--></p>
  `,
})
