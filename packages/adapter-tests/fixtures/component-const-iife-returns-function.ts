import { createFixture } from '../src/types'

/**
 * A component const initialized by an immediately invoked arrow that
 * returns an anonymous arrow (`(() => () => 1)()`), whose `name` a slot
 * reads. Written as `const B = () => 1`, the arrow would take the name `B`;
 * the call returns one with an empty name, so the const keeps the call and
 * the template adapters refuse the read (BF101, `const-iife-unlowered`).
 */
export const fixture = createFixture({
  id: 'component-const-iife-returns-function',
  description: 'a component const holding the anonymous arrow an immediately invoked arrow returns keeps its empty name',
  escapes: [{ kind: 'client-directive', fixture: 'component-const-iife-returns-function-client' }],
  source: `
'use client'
export function ComponentConstIifeReturnsFunction() {
  const B = (() => () => 1)()
  return <p>{B.name || 'anonymous'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">anonymous</p>
  `,
})
