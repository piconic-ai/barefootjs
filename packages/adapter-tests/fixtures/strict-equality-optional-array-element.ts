import { createFixture } from '../src/types'

/**
 * Every template adapter refuses the comparison with BF101 (#3824 step 8):
 * a strict equality between an element of an optional array of objects and
 * itself. The prop's facts are `Row[]` or nil, and the union must keep the
 * element type as possible-object evidence for the refusal. The rewrite
 * compares a primitive field: `strict-equality-reference-rewrite`.
 */
export const fixture = createFixture({
  id: 'strict-equality-optional-array-element',
  description: '=== between an element of an optional object array and itself is true',
  source: `
interface Row { id: number }

export function StrictEqualityOptionalArrayElement({ rows }: { rows?: Row[] }) {
  return <p>{rows && (rows[0] === rows[0] ? 'same' : 'different')}</p>
}
`,
  props: { rows: [{ id: 1 }] },
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf-cond-start:s1-->same<!--bf-cond-end:s1--><!--bf-cond-end:s0--></p>
  `,
})
