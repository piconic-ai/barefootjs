import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-inherited-key-object-method` and
 * `module-const-inherited-key-iife`, and the client side of the
 * `-function*` fixtures: a local function returning a memo
 * that reads a key only a literal const's prototype has, a function reading
 * it directly, a function calling another, and an object const method, each
 * called only from a `/* @client *\/` position. The server render never
 * evaluates them, so the component compiles on every template adapter.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key-function-client',
  description: 'local functions and methods reading an inherited const key, called only from /* @client */, defer to the browser',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function ModuleConstInheritedKeyFunctionClient() {
  const R = { k: 'v' }
  const m = createMemo(() => (R.toString ? 'y' : 'n'))
  function value() {
    return m()
  }
  function direct() {
    return R.toString ? 'y' : 'n'
  }
  function outer() {
    return value() + '!'
  }
  const H = { get: () => (R.toString ? 'y' : 'n') }
  return (
    <p>
      {/* @client */ value()}|{/* @client */ direct()}|{/* @client */ outer()}|{/* @client */ H.get()}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0--><!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/-->|<!--bf:s3--><!--/--></p>
  `,
})
