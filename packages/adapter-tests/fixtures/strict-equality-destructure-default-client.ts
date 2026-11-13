import { createFixture } from '../src/types'

/**
 * Escape twin for `strict-equality-destructure-default-distinct`: the prop
 * whose computed default compares an object with `===` is read only from a
 * `/* @client *\/` position, so the server render never needs the default's
 * value and every template adapter compiles the component. The browser
 * computes the comparison.
 */
export const fixture = createFixture({
  id: 'strict-equality-destructure-default-client',
  description: 'a destructure default comparing objects, read only from a /* @client */ position, defers to the browser',
  source: `
'use client'
const DEF = { x: 1 }
export function StrictEqualityDestructureDefaultClient({ obj, b = obj === DEF }: { obj: { x: number }; b?: boolean }) {
  return <p>{/* @client */ b ? 'same' : 'different'}</p>
}
`,
  props: { obj: { x: 1 } },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf-cond-start:s0--><!--bf-cond-end:s0--></p>
  `,
})
