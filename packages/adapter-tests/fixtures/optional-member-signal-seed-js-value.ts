import { createFixture } from '../src/types'

/**
 * A signal seeded from an object prop's optional scalar field
 * (`createSignal(initial.label)`) holds the field's JS value: the string
 * when it is set, `undefined` when the object omits it, `null` when the
 * object holds `null`. `String()`, a strict `=== undefined` test, an
 * attribute (omitted for `null` / `undefined`) and a child prop (whose
 * destructure default applies to `undefined` only) all read that value.
 */
export const fixture = createFixture({
  id: 'optional-member-signal-seed-js-value',
  description: "A signal seeded from an object prop's optional scalar field holds the field's JS value: its string, undefined or null",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Init = { label?: string }

function Kid({ label = 'kid' }: { label?: string }) {
  return <i>{String(label)}</i>
}

export function OptionalMemberSignalSeedJsValue({ initial }: { initial: Init }) {
  const [label] = createSignal(initial.label)
  return (
    <p title={label()}>
      {String(label())}|{label() === undefined ? 'undef' : 'set'}|{label() === null ? 'null' : 'not-null'}
      <Kid label={label()} />
    </p>
  )
}
`,
  props: { initial: { label: 'hello' } },
  expectedHtml: `
    <p bf-s="test" bf="s4" title="hello"><!--bf:s0-->hello<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->not-null<!--bf-cond-end:s2--><i bf-s="test_s3" bf="s1"><!--bf:s0-->hello<!--/--></i></p>
  `,
  dataPoints: [
    { name: 'omitted', props: { initial: {} } },
    { name: 'null', props: { initial: { label: null } } },
  ],
})
