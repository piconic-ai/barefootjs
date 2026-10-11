import { createFixture } from '../src/types'

/**
 * `.length` on a field of an object signal typed by a named type (#3439):
 * a string field counts its characters and an array field its elements.
 * The field's type is not visible at the read site, so a backend that
 * picks the array form from the expression shape dies on the string field.
 * The same holds for a loop item's field inside a `.filter()` predicate.
 */
export const fixture = createFixture({
  id: 'object-signal-field-length',
  description: '.length on a named object type\'s string and array fields, read directly and in a filter predicate',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type User = { name?: string; tags?: string[] }
type Item = { name: string; tags: string[] }
export function ObjectSignalFieldLength() {
  const [user] = createSignal<User>({ name: 'pat', tags: ['a', 'b'] })
  const [items] = createSignal<Item[]>([{ name: 'ab', tags: ['x'] }, { name: 'abcd', tags: [] }])
  return (
    <div>
      <p>{user().name?.length}|{user().name!.length}|{user().tags!.length}</p>
      <ul>{items().filter(i => i.name.length > 2).map(i => <li key={i.name}>{i.name}</li>)}</ul>
      <p>{items().filter(i => i.tags.length > 0).length}</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s3"><!--bf:s0-->3<!--/-->|<!--bf:s1-->3<!--/-->|<!--bf:s2-->2<!--/--></p>
      <ul bf="s5"><li data-key="abcd"><!--bf:s4-->abcd<!--/--></li></ul>
      <p bf="s7"><!--bf:s6-->1<!--/--></p>
    </div>
  `,
})
