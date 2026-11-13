import { createFixture } from '../src/types'

/**
 * Every template adapter refuses the comparison with BF101 (#3725): a strict
 * equality in a computed destructure default between a prop object and an
 * object const with the same contents. A backend applies the default as the
 * expression it stands for, where the const is spelled as a literal and the
 * runtime would compare the two by contents. JS compares by reference, so
 * they differ. The rewrite compares a primitive field:
 * `strict-equality-reference-rewrite`.
 */
export const fixture = createFixture({
  id: 'strict-equality-destructure-default-distinct',
  description: '=== between a prop object and an equal-content object const in a destructure default is false',
  source: `
const DEF = { x: 1 }
export function StrictEqualityDestructureDefaultDistinct({ obj, b = obj === DEF }: { obj: { x: number }; b?: boolean }) {
  return <p>{b ? 'same' : 'different'}</p>
}
`,
  props: { obj: { x: 1 } },
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf-cond-start:s0-->different<!--bf-cond-end:s0--></p>
  `,
})
