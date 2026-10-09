import { createFixture } from '../src/types'

/**
 * Numeric twin of `member-seeded-nullable-signal-shared-type` (#3323): the
 * shared `Init.count` is held for `Host`'s nullable seed, while `Plain`
 * forwards the same member into `Child`'s required `number` prop. Adapters
 * that box the shared field must still hand the concrete reader its own
 * numeric representation.
 */
export const fixture = createFixture({
  id: 'member-seeded-nullable-signal-shared-type-number',
  description: 'A shared object type read both as a nullable numeric signal seed and as a non-nullable numeric seed forwarded into a required number child prop renders the member in both places',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Init = { count?: number }

function Child({ count }: { count: number }) {
  return <span className="child">{count}</span>
}

function Plain({ initial }: { initial: Init }) {
  const [count] = createSignal<number>(initial.count!)
  return <Child count={count()} />
}

export function MemberSeededNullableSignalSharedTypeNumber({ initial }: { initial: Init }) {
  const [value] = createSignal<number | undefined>(initial.count)
  return (
    <div data-n={value()}>
      <Plain initial={initial} />
    </div>
  )
}
`,
  props: { initial: { count: 7 } },
  expectedHtml: `
    <div bf-s="test" bf="s1" data-n="7"><span bf-s="test_s0_s0" bf="s1" class="child"><!--bf:s0-->7<!--/--></span></div>
  `,
})
