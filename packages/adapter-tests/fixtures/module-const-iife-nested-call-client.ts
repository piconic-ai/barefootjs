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
export function ModuleConstIifeNestedCallClient() {
  return <p>{/* @client */ P}|{/* @client */ Q}|{/* @client */ C}|{/* @client */ T}|{/* @client */ L[0]}|{/* @client */ M[0]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/-->|<!--bf:s3--><!--/-->|<!--bf:s4--><!--/-->|<!--bf:s5--><!--/--></p>
  `,
})
