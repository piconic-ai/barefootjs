import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-optional-member-missing-field-attr` (#3421): an object
 * signal's optional `string` / `number` fields read where `undefined` is
 * observable (an attribute, `??`) for a missing field and for a supplied
 * `''` / `0`. `Plain` shares the `User` type and reads the same fields
 * concretely (bare text, arithmetic), so adapters that make the
 * shared field nillable must still render those reads.
 */
export const fixture = createFixture({
  id: 'nullish-optional-member-field-matrix',
  description: "An object signal's optional fields distinguish a missing field from a supplied empty value, while a concrete reader of the shared type still renders them",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type User = { name?: string; age?: number }

function Plain() {
  const [user] = createSignal<User>({ name: 'pat', age: 3 })
  return (
    <div className="plain">
      <b>{user().name}</b>|<u>{user().age! * 2}</u>
    </div>
  )
}

export function NullishOptionalMemberFieldMatrix() {
  const [blank] = createSignal<User>({})
  const [given] = createSignal<User>({ name: '', age: 0 })
  return (
    <div>
      <p className="blank" data-name={blank()?.name} data-age={blank()?.age}>{blank().name ?? 'anon'}|{blank().age ?? -1}</p>
      <p className="given" data-name={given()?.name} data-age={given()?.age}>{given().name ?? 'anon'}|{given().age ?? -1}</p>
      <Plain />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s2" class="blank"><!--bf:s0-->anon<!--/-->|<!--bf:s1-->-1<!--/--></p>
      <p bf="s5" class="given" data-age="0" data-name=""><!--bf:s3--><!--/-->|<!--bf:s4-->0<!--/--></p>
      <div bf-s="test_s6" class="plain">
        <b bf="s1"><!--bf:s0-->pat<!--/--></b>|<u bf="s3"><!--bf:s2-->6<!--/--></u>
      </div>
    </div>
  `,
})
