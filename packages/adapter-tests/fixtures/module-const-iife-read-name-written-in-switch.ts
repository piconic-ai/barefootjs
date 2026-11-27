import { createFixture } from '../src/types'

/**
 * A module const initialized by an immediately invoked arrow that reads the
 * module const `value`, in a file where a `switch` writes another binding of
 * that spelling (`case 0: let value`, `case 1: value = 'shadow'`, the shared
 * scope of the switch). Writes are matched by spelling, a deliberate sound
 * over-approximation, so the const keeps the call and the template adapters
 * refuse the read (BF101, `const-iife-unlowered`), where the plain
 * `const B = { k: value }` would fold.
 */
export const fixture = createFixture({
  id: 'module-const-iife-read-name-written-in-switch',
  description: 'a module IIFE const reading a const whose name a switch case writes elsewhere renders what the arrow returns',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-read-name-written-in-switch-client' }],
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
export function ModuleConstIifeReadNameWrittenInSwitch() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">outer</p>
  `,
})
