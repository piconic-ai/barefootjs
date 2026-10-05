import { createFixture } from '../src/types'

/**
 * Sibling of the shared `nullish-signal-attr` (#3304): an attribute bound
 * to an optional member read is omitted when the read is `undefined`
 * through an `undefined` object, and rendered for a present value,
 * including `''` and `0` (#3322). A missing field of a present object is
 * `nullish-optional-member-missing-field-attr`.
 */
export const fixture = createFixture({
  id: 'nullish-optional-member-attr',
  description: 'An attribute bound to an optional member read is omitted when the read is nullish and rendered for present or falsy values',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type User = { name?: string; age?: number }

export function NullishOptionalMemberAttr() {
  const [none] = createSignal<User | undefined>(undefined)
  const [some] = createSignal<User>({ name: '', age: 0 })
  return (
    <div>
      <p className="none" data-name={none()?.name}>a</p>
      <p className="empty" data-name={some()?.name} data-age={some()?.age}>b</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="none">a</p>
      <p bf="s1" class="empty" data-age="0" data-name="">b</p>
    </div>
  `,
})
