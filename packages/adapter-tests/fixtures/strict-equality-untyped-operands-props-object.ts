import { createFixture } from '../src/types'

/**
 * `===` / `!==` between props whose type is not statically a string, read
 * through `function C(props)` instead of a destructure. Two different
 * non-numeric strings must compare unequal on a backend whose `==` is
 * numeric (Perl); equal numbers must still compare equal.
 */
export const fixture = createFixture({
  id: 'strict-equality-untyped-operands-props-object',
  description: '=== / !== between untyped props read off a props object keeps JS strict semantics',
  source: `
export function StrictEqualityPropsObject(props: { a: string | number; b: string | number; n: string | number; m: string | number }) {
  return (
    <div data-eq={String(props.a === props.b)}>
      <p>{props.a === props.b ? 'same' : 'different'}</p>
      <p>{props.a !== props.b ? 'ne' : 'eq'}</p>
      <p>{props.n === props.m ? 'same' : 'different'}</p>
      <p>{props.a !== props.b && 'props differ'}</p>
    </div>
  )
}
`,
  props: { a: 'x', b: 'y', n: 3, m: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s8" data-eq="false">
      <p bf="s1"><!--bf-cond-start:s0-->different<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->ne<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->same<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->props differ<!--bf-cond-end:s6--></p>
    </div>
  `,
})
