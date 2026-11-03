import { createFixture } from '../src/types'

/**
 * A strict equality against an optional `number` prop keeps the prop's
 * absence (#3824 step 8), so an adapter may box the prop (Go flips it to
 * `interface{}`). The same prop seeds a typed `createSignal<number>` whose
 * value is forwarded into a child's `number` prop: the child must read the
 * caller's integer-valued input, not the zero a float-only unboxing yields.
 * The unparameterized `createSignal(n)` takes another path, so the typed
 * form is the one this fixture pins.
 */
export const fixture = createFixture({
  id: 'strict-equality-boxed-number-typed-signal-child',
  description: 'An optional number prop compared with === and seeding a typed number signal forwarded into a child number prop renders the integer input in the child',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Child({ value }: { value: number }) {
  return <b>{value}</b>
}

export function StrictEqualityBoxedNumberTypedSignalChild({ n }: { n?: number }) {
  const [value] = createSignal<number>(n)
  return (
    <div data-eq={n === 0 ? 'yes' : 'no'}>
      <Child value={value()} />
    </div>
  )
}
`,
  props: { n: 5 },
  expectedHtml: `
    <div bf-s="test" bf="s1" data-eq="no"><b bf-s="test_s0" bf="s1"><!--bf:s0-->5<!--/--></b></div>
  `,
})
