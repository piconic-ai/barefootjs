import { createFixture } from '../src/types'

/**
 * A memo computed from a field of an object signal typed by a named type
 * (#3436). The SSR value is the memo body evaluated over the seed, for a
 * string and a number field, with and without `??`, and a memo over such a
 * memo.
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
  return <p>{label()}|{next()}|{upper()}|{doubled()}|{twice()}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s5"><!--bf:s0-->pat<!--/-->|<!--bf:s1-->3<!--/-->|<!--bf:s2-->PAT<!--/-->|<!--bf:s3-->4<!--/-->|<!--bf:s4-->6<!--/--></p>
  `,
})
