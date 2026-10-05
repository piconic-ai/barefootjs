import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-optional-member-attr` (#3322): an attribute bound to
 * an optional member read of a present object whose optional field is
 * missing (`blank()?.name` with `blank()` = `{}`) is omitted.
 */
export const fixture = createFixture({
  id: 'nullish-optional-member-missing-field-attr',
  description: "An attribute bound to a present object's missing optional field is omitted",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type User = { name?: string }

export function NullishOptionalMemberMissingFieldAttr() {
  const [blank] = createSignal<User>({})
  return (
    <div>
      <p className="missing" data-name={blank()?.name}>a</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><p bf="s0" class="missing">a</p></div>
  `,
})
