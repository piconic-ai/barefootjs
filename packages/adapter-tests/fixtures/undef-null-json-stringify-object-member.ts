import { createFixture } from '../src/types'

/**
 * `JSON.stringify` of an object whose member is `undefined` drops the
 * member, while a `null` member is written `null`
 * (`spec/js-undefined-value.md` §1, decision 5): `{ a: null, b: undefined }`
 * is `{"a":null}`. The object is a signal seeded from a static literal (a
 * literal reading a prop is refused on one target for an unrelated
 * reason, `derived-object-literal-signal`); an explicit `undefined`
 * member and a missing member are both dropped.
 */
export const fixture = createFixture({
  id: 'undef-null-json-stringify-object-member',
  description: 'JSON.stringify drops an undefined object member and writes a null one',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type O = { a?: string | null; b?: string | null; c?: string | null }
export function UndefNullJsonStringifyObjectMember() {
  const [o] = createSignal<O>({ a: null, b: undefined })
  return <p data-j={JSON.stringify(o())}>{JSON.stringify(o())}|{JSON.stringify([o().a, o().b, o().c])}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2" data-j="{&quot;a&quot;:null}"><!--bf:s0-->{&quot;a&quot;:null}<!--/-->|<!--bf:s1-->[null,null,null]<!--/--></p>
  `,
})
