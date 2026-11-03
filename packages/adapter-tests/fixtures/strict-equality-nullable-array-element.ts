import { createFixture } from '../src/types'

/**
 * Every template adapter refuses the comparison with BF101 (#3824 step 8):
 * the `Row[] | null` twin of `strict-equality-optional-array-element`, an
 * element read through `.at()`. The union with `null` must keep the element
 * type as possible-object evidence for the refusal. The rewrite compares a
 * primitive field: `strict-equality-reference-rewrite`.
 */
export const fixture = createFixture({
  id: 'strict-equality-nullable-array-element',
  description: '!== between an element of a nullable object array and itself is false',
  source: `
interface Row { id: number }

export function StrictEqualityNullableArrayElement({ rows }: { rows: Row[] | null }) {
  return <p>{rows !== null && (rows.at(0) !== rows.at(0) ? 'ne' : 'eq')}</p>
}
`,
  props: { rows: [{ id: 1 }] },
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0--><!--bf-cond-start:s1-->eq<!--bf-cond-end:s1--><!--bf-cond-end:s0--></p>
  `,
})
