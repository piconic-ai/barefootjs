import { createFixture } from '../src/types'

/**
 * Every template adapter refuses the comparison with BF101 (#3824 step 8):
 * a strict equality between an object and itself, moved into a `.map()`
 * body's `const`. A template adapter evaluates the preamble initializer at
 * SSR as a per-row local, and the row reads only the local's bare name, so
 * the initializer is the position the refusal must scan. The rewrite
 * compares a primitive field: `strict-equality-reference-rewrite`.
 */
export const fixture = createFixture({
  id: 'strict-equality-preamble-reference',
  description: '=== between an object and itself in a loop preamble const is true',
  source: `
export function StrictEqualityPreambleReference({ rows, obj }: { rows: number[]; obj: { id: number } }) {
  return (
    <div>
      {rows.map(row => {
        const same = obj === obj
        return <p key={row}>{same ? 'same' : 'different'}</p>
      })}
    </div>
  )
}
`,
  props: { rows: [1], obj: { id: 1 } },
  escapes: [
    { kind: 'rewrite', fixture: 'strict-equality-reference-rewrite' },
    { kind: 'client-directive', fixture: 'strict-equality-reference-client' },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s1"><p data-key="1"><!--bf-cond-start:s0-->same<!--bf-cond-end:s0--></p></div>
  `,
})
