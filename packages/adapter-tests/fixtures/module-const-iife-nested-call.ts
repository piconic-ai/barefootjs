import { createFixture } from '../src/types'

/**
 * Module consts whose initializer calls an arrow literal in place below the
 * top: under an operator, inside an arrow the outer call peels to
 * (`(() => (() => 1)() + 2)()`), in a conditional, a template literal, an
 * array literal, an array iteration callback, and the defaults of such a
 * callback's parameters (plain and destructured). No template evaluates the
 * call, so the template adapters refuse the reads (BF101,
 * `const-iife-unlowered`).
 */
export const fixture = createFixture({
  id: 'module-const-iife-nested-call',
  description: 'module consts whose initializer calls an arrow literal below the top render what the calls return',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-nested-call-client' }],
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
export function ModuleConstIifeNestedCall() {
  return <p>{P}|{Q}|{C}|{T}|{L[0]}|{M[0]}|{D[0]}|{E[0]}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">3|3|c|tv|l|m!|d|e</p>
  `,
})
