import { createFixture } from '../src/types'

/**
 * A module function reads the module's `label` beside a component const of
 * the same name: called from a signal seed, a memo and markup, it returns the
 * module's value, directly and through another module function (`outer`
 * calling `inner`).
 */
export const fixture = createFixture({
  id: 'module-function-reads-module-binding',
  description: 'A module function called from a signal seed, a memo and markup reads the module binding a component const of the same name hides',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
const label = 'module'
function value() { return label }
function inner() { return label + '-inner' }
function outer() { return inner() }
export function ModuleFunctionReadsModuleBinding() {
  const label = 'component'
  const [n] = createSignal(value())
  const [o] = createSignal(outer())
  const m = createMemo(() => value() + '!')
  return <p>{value()}:{n()}:{m()}:{outer()}:{o()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s5"><!--bf:s0-->module<!--/-->:<!--bf:s1-->module<!--/-->:<!--bf:s2-->module!<!--/-->:<!--bf:s3-->module-inner<!--/-->:<!--bf:s4-->module-inner<!--/--></p>
  `,
})
