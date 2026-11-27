import { createFixture } from '../src/types'

/**
 * A module const initialized by an immediately invoked zero-param arrow
 * whose body constructs a value (`new Date(0)`). Such a body is not read as
 * the const's value: one that samples (`new Date()`, `Math.random()`) would
 * differ between two reads of it where the server evaluated it once. No
 * template evaluates the call, so the template adapters refuse the read
 * (BF101, `const-iife-unlowered`).
 */
export const fixture = createFixture({
  id: 'module-const-iife-sampling-body',
  description: 'a module const initialized by an immediately invoked arrow that constructs a value renders client-side',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-iife-sampling-body-client' }],
  source: `
'use client'
const B = (() => ({ k: new Date(0).toISOString() }))()
export function ModuleConstIifeSamplingBody() {
  return <p>{B.k}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">1970-01-01T00:00:00.000Z</p>
  `,
})
