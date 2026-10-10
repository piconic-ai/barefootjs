import { createFixture } from '../src/types'

/**
 * Sibling of `member-seeded-nullable-signal-attr` (#3323): `Host` seeds a
 * nullable signal from `initial.label`, which needs the shared `Init.label`
 * to hold an absent member, while `Plain` reads the same member through a
 * non-nullable signal and forwards it into `Child`'s required `string`
 * prop. Adapters that type the shared field for the nullable reader must
 * still hand the concrete reader a concrete value.
 */
export const fixture = createFixture({
  id: 'member-seeded-nullable-signal-shared-type',
  description: 'A shared object type read both as a nullable signal seed and as a non-nullable seed forwarded into a required scalar child prop renders the member in both places',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Init = { label?: string }

function Child({ label }: { label: string }) {
  return <span className="child">{label}</span>
}

function Plain({ initial }: { initial: Init }) {
  const [label] = createSignal<string>(initial.label!)
  return <Child label={label()} />
}

export function MemberSeededNullableSignalSharedType({ initial }: { initial: Init }) {
  const [value] = createSignal<string | undefined>(initial.label)
  return (
    <div title={value()}>
      <Plain initial={initial} />
    </div>
  )
}
`,
  props: { initial: { label: 'hello' } },
  expectedHtml: `
    <div bf-s="test" bf="s1" title="hello"><span bf-s="test_s0_s0" bf="s1" class="child"><!--bf:s0-->hello<!--/--></span></div>
  `,
})
