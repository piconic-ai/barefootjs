import { createFixture } from '../src/types'

/**
 * A fractional value passed into a child component's `number` prop
 * (#3459): a literal, a signal seeded with a fraction, an object signal's
 * fractional field, a division, a loop row's fractional field (the only
 * caller of `Cost`), and a fraction forwarded through `Relay`. The widened
 * prop still takes integer callers (`props.count`, a row's `qty`), and a
 * child prop that only receives integers keeps its integer output.
 */
export const fixture = createFixture({
  id: 'child-number-prop-fraction',
  description: 'fractional values passed into a child\'s number prop keep their fraction',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type User = { name?: string; age?: number }
type Item = { id: string; price: number; qty: number }
function Price({ value }: { value: number }) {
  return <span>{value}</span>
}
function Cost({ value }: { value: number }) {
  return <i>{value}</i>
}
function Relay({ value }: { value: number }) {
  return <Price value={value} />
}
function Count({ n }: { n: number }) {
  return <b>{n}</b>
}
export function ChildNumberPropFraction(props: { count: number }) {
  const [n] = createSignal(2.5)
  const [u] = createSignal<User>({ name: 'pat', age: 1.5 })
  const [total] = createSignal(7)
  const [items] = createSignal<Item[]>([{ id: 'a', price: 0.5, qty: 3 }, { id: 'b', price: 2, qty: 4 }])
  return (
    <div>
      <Price value={2.25} />
      <Price value={n()} />
      <Price value={u().age!} />
      <Price value={total() / 2} />
      <Count n={total()} />
      <ul>{items().map(i => <li key={i.id}><Cost value={i.price} /><Price value={i.qty} /></li>)}</ul>
      <Relay value={0.75} />
      <Price value={props.count} />
    </div>
  )
}
`,
  props: { count: 5 },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s1"><!--bf:s0-->2.25<!--/--></span>
      <span bf-s="test_s1" bf="s1"><!--bf:s0-->2.5<!--/--></span>
      <span bf-s="test_s2" bf="s1"><!--bf:s0-->1.5<!--/--></span>
      <span bf-s="test_s3" bf="s1"><!--bf:s0-->3.5<!--/--></span>
      <b bf-s="test_s4" bf="s1"><!--bf:s0-->7<!--/--></b>
      <ul bf="s7">
        <li data-key="a">
          <i bf-s="test_s5" bf="s1"><!--bf:s0-->0.5<!--/--></i>
          <span bf-s="test_s6" bf="s1"><!--bf:s0-->3<!--/--></span>
        </li>
        <li data-key="b">
          <i bf-s="test_s5" bf="s1"><!--bf:s0-->2<!--/--></i>
          <span bf-s="test_s6" bf="s1"><!--bf:s0-->4<!--/--></span>
        </li>
      </ul>
      <span bf-s="test_s8_s0" bf="s1"><!--bf:s0-->0.75<!--/--></span>
      <span bf-s="test_s9" bf="s1"><!--bf:s0-->5<!--/--></span>
    </div>
  `,
})
