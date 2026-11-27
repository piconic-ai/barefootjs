import { createFixture } from '../src/types'

/**
 * A module const initialized by an immediately invoked arrow that takes an
 * argument (`((x) => ({ k: x }))('v')`). No template evaluates the call, so
 * the template adapters refuse the read (BF101, `const-iife-unlowered`).
 */
export const fixture = createFixture({
  id: 'module-const-iife-with-argument',
  description: 'a module const initialized by an immediately invoked arrow with an argument renders client-side',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-with-argument-client' }],
  source: `
'use client'
const B = ((x: string) => ({ k: x }))('v')
export function ModuleConstIifeWithArgument() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v</p>
  `,
})
