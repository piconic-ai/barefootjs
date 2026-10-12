import { createFixture } from '../src/types'

/**
 * A memo computed from a field of an object signal typed by a named type
 * (#3436). The SSR value is the memo body evaluated over the seed, for a
 * string and a number field, with and without `??`, a memo over such a
 * memo, and a field read off an `undefined`-seeded object signal. A field
 * the seed omits is absent for `??` (not a zero value), a string seed keeps
 * its quotes, and `??` over an identity memo of an `undefined` signal falls
 * back.
 */
export const fixture = createFixture({
  id: 'object-signal-field-memo',
  description: 'memos over a named object signal\'s string and number fields bake their SSR values',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
type User = { name?: string; age?: number }
export function ObjectSignalFieldMemo() {
  const [u] = createSignal<User>({ name: 'pat', age: 2 })
  const label = createMemo(() => u().name ?? 'x')
  const next = createMemo(() => (u().age ?? 0) + 1)
  const upper = createMemo(() => u().name!.toUpperCase())
  const doubled = createMemo(() => u().age! * 2)
  const twice = createMemo(() => next() * 2)
  const [none] = createSignal<User | undefined>(undefined)
  const missing = createMemo(() => none()?.name ?? 'none')
  const [blank] = createSignal<User>({})
  const blankName = createMemo(() => blank().name ?? 'x')
  const blankAge = createMemo(() => (blank().age ?? 5) + 1)
  const [quote] = createSignal("it's")
  const shout = createMemo(() => quote().toUpperCase())
  const [unset] = createSignal<string | undefined>(undefined)
  const identity = createMemo(() => unset())
  const viaIdentity = createMemo(() => identity() ?? 'y')
  return <p>{label()}|{next()}|{upper()}|{doubled()}|{twice()}|{missing()}|{blankName()}|{blankAge()}|{shout()}|{identity()}|{viaIdentity()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s11"><!--bf:s0-->pat<!--/-->|<!--bf:s1-->3<!--/-->|<!--bf:s2-->PAT<!--/-->|<!--bf:s3-->4<!--/-->|<!--bf:s4-->6<!--/-->|<!--bf:s5-->none<!--/-->|<!--bf:s6-->x<!--/-->|<!--bf:s7-->6<!--/-->|<!--bf:s8-->IT&#39;S<!--/-->|<!--bf:s9--><!--/-->|<!--bf:s10-->y<!--/--></p>
  `,
})
