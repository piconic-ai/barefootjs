import { createFixture } from '../src/types'

/**
 * The destructured form of `optional-member-signal-seed-js-value` over a
 * field typed `label?: string | null`: the object type has a nil union
 * leaf, which the analyzer resolves for `{ initial }: { initial: Init }` as
 * it does for `props: { initial: Init }`. The signal holds the field's JS
 * value, its string, `undefined` when the object omits it, `null` when the
 * object holds `null`.
 */
export const fixture = createFixture({
  id: 'nullable-member-signal-seed-destructured',
  description: "A destructured object prop's `T | null` optional field seeds a signal with its JS value",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Init = { label?: string | null }

export function NullableMemberSignalSeedDestructured({ initial }: { initial: Init }) {
  const [label] = createSignal(initial.label)
  return (
    <p title={label()}>
      {String(label())}|{label() === undefined ? 'undef' : 'set'}|{label() === null ? 'null' : 'not-null'}
    </p>
  )
}
`,
  props: { initial: { label: 'hello' } },
  expectedHtml: `
    <p bf-s="test" bf="s3" title="hello"><!--bf:s0-->hello<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->not-null<!--bf-cond-end:s2--></p>
  `,
  dataPoints: [
    { name: 'omitted', props: { initial: {} } },
    { name: 'null', props: { initial: { label: null } } },
  ],
})
