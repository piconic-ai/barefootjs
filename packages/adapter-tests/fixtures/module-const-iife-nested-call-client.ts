import { createFixture } from '../src/types'

/**
 * The `/* @client *\/` escape of `module-const-iife-nested-call`: the reads of
 * the consts are deferred to the browser, so the server renders the text
 * slots empty.
 */
export const fixture = createFixture({
  id: 'module-const-iife-nested-call-client',
  description: 'The client-directive escape of module-const-iife-nested-call',
  source: `
'use client'
const c = true
const P = (() => (() => 1)() + 2)()
const Q = (() => 1)() + 2
const C = c ? (() => 'c')() : 'd'
const T = \`t\${(() => 'v')()}\`
const L = [(() => 'l')()]
const M = ['m'].map(x => (() => x + '!')())
const D = [undefined].map((x = (() => 'd')()) => x)
const E = [{}].map(({ a = (() => 'e')() }: { a?: string }) => a)
export function ModuleConstIifeNestedCallClient() {
  return <p>{/* @client */ P}|{/* @client */ Q}|{/* @client */ C}|{/* @client */ T}|{/* @client */ L[0]}|{/* @client */ M[0]}|{/* @client */ D[0]}|{/* @client */ E[0]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/-->|<!--bf:s3--><!--/-->|<!--bf:s4--><!--/-->|<!--bf:s5--><!--/-->|<!--bf:s6--><!--/-->|<!--bf:s7--><!--/--></p>
  `,
})
