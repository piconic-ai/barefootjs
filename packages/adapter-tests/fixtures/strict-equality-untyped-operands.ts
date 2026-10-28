import { createFixture } from '../src/types'

/**
 * `===` / `!==` between operands whose type the compiler cannot tell from
 * the source: `.at()` results, array elements, a loop item and its
 * neighbour, and props typed as a union. A backend whose `==` is numeric
 * (Perl) coerces two different non-numeric strings to `0` and reads them as
 * equal, so the comparison must keep JS's strict type-and-value semantics.
 * Numbers and booleans compared the same way must stay equal by value.
 * Covers text, attribute, ternary, `&&`, template literal, a child prop and
 * a loop row.
 */
export const fixture = createFixture({
  id: 'strict-equality-untyped-operands',
  description: '=== / !== between operands not statically known as strings keeps JS strict semantics',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Badge({ same }: { same: boolean }) {
  return <i>{same ? 'same' : 'different'}</i>
}

export function StrictEqualityUntypedOperands({ a, b, n, m }: { a: string | number; b: string | number; n: string | number; m: string | number }) {
  const [word] = createSignal('abc')
  const [items] = createSignal(['p', 'q', 'p'])
  const [nums] = createSignal([1, 1, 2])
  const [flags] = createSignal([true, true, false])
  return (
    <div data-eq={String(items().at(0) === items().at(1))}>
      <p>{word().at(0) !== word().at(2) ? 'ne' : 'eq'}</p>
      <p>{items().at(0) === items().at(1) ? 'same' : 'different'}</p>
      <p>{items().at(0) === items().at(2) ? 'same' : 'different'}</p>
      <p>{items()[0] === items()[1] ? 'same' : 'different'}</p>
      <p>{nums().at(0) === nums().at(1) ? 'same' : 'different'}</p>
      <p>{nums().at(0) !== nums().at(2) ? 'ne' : 'eq'}</p>
      <p>{flags().at(0) === flags().at(1) ? 'same' : 'different'}</p>
      <p>{flags().at(0) === flags().at(2) ? 'same' : 'different'}</p>
      <p>{a === b ? 'same' : 'different'}</p>
      <p>{n === m ? 'same' : 'different'}</p>
      <p>{a !== b && 'props differ'}</p>
      <p>{\`\${items().at(0) === items().at(1) ? 'same' : 'different'}\`}</p>
      <Badge same={items().at(0) === items().at(1)} />
      <ul>
        {items().map((item, i) => (
          <li key={i}>{item === items().at(0) ? 'first' : 'other'}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { a: 'x', b: 'y', n: 3, m: 3 },
  expectedHtml: `
    <div bf-s="test" bf="s28" data-eq="false">
      <p bf="s1"><!--bf-cond-start:s0-->ne<!--bf-cond-end:s0--></p>
      <p bf="s3"><!--bf-cond-start:s2-->different<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->same<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->different<!--bf-cond-end:s6--></p>
      <p bf="s9"><!--bf-cond-start:s8-->same<!--bf-cond-end:s8--></p>
      <p bf="s11"><!--bf-cond-start:s10-->ne<!--bf-cond-end:s10--></p>
      <p bf="s13"><!--bf-cond-start:s12-->same<!--bf-cond-end:s12--></p>
      <p bf="s15"><!--bf-cond-start:s14-->different<!--bf-cond-end:s14--></p>
      <p bf="s17"><!--bf-cond-start:s16-->different<!--bf-cond-end:s16--></p>
      <p bf="s19"><!--bf-cond-start:s18-->same<!--bf-cond-end:s18--></p>
      <p bf="s21"><!--bf-cond-start:s20-->props differ<!--bf-cond-end:s20--></p>
      <p bf="s23"><!--bf:s22-->different<!--/--></p>
      <i bf-s="test_s24" bf="s2"><!--bf-cond-start:s0-->different<!--bf-cond-end:s0--></i>
      <ul bf="s27">
        <li bf="s26" data-key="0"><!--bf-cond-start:s25-->first<!--bf-cond-end:s25--></li>
        <li bf="s26" data-key="1"><!--bf-cond-start:s25-->other<!--bf-cond-end:s25--></li>
        <li bf="s26" data-key="2"><!--bf-cond-start:s25-->first<!--bf-cond-end:s25--></li>
      </ul>
    </div>
  `,
})
