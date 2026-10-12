import { createFixture } from '../src/types'

/**
 * A fractional literal seeding a `number` field of a named object type
 * (#3438): the signal's own field, an array element's field, and a memo
 * over it with a non-integer result (`2.5 * 3`). An integer-only field next
 * to them keeps its integer output.
 */
export const fixture = createFixture({
  id: 'object-signal-fractional-field-seed',
  description: 'fractional seeds for named object types\' number fields render and compute as fractions',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
type User = { name?: string; age?: number; score: number }
type Item = { qty: number; price: number }
export function ObjectSignalFractionalFieldSeed() {
  const [u] = createSignal<User>({ name: 'pat', age: 2.5, score: 3 })
  const [items] = createSignal<Item[]>([{ qty: 2, price: 1.25 }, { qty: 1, price: 4 }])
  const tripled = createMemo(() => u().age! * 3)
  return (
    <div>
      <p>{u().name}|{u().age}|{u().score}|{tripled()}</p>
      <ul>{items().map(i => <li key={i.qty}>{i.qty}x{i.price}</li>)}</ul>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s4"><!--bf:s0-->pat<!--/-->|<!--bf:s1-->2.5<!--/-->|<!--bf:s2-->3<!--/-->|<!--bf:s3-->7.5<!--/--></p>
      <ul bf="s7">
        <li data-key="2"><!--bf:s5-->2<!--/-->x<!--bf:s6-->1.25<!--/--></li>
        <li data-key="1"><!--bf:s5-->1<!--/-->x<!--bf:s6-->4<!--/--></li>
      </ul>
    </div>
  `,
})
