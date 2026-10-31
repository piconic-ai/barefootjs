import { createFixture } from '../src/types'

/**
 * An object index read with a lowercase key on an object that holds only the
 * capitalised key: `{ Name: 'upper' }['name']` is `undefined`, in a template
 * read, a memo body and a `.filter()` predicate.
 */
export const fixture = createFixture({
  id: 'index-read-capitalised-key-only',
  description: 'A lowercase index key does not read an object key that differs only by its capitalised first letter',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function IndexReadCapitalisedKeyOnly({ obj, k, keys }: {
  obj: Record<string, string>
  k: string
  keys: string[]
}) {
  const picked = createMemo(() => obj[k] ?? '-')
  return (
    <div data-v={obj[k]}>
      <span>{obj[k] ?? '-'}|{obj['name'] ?? '-'}|{obj['Name'] ?? '-'}</span>
      <span>{picked()}</span>
      <span>{keys.filter(key => obj[key]).length}</span>
    </div>
  )
}
`,
  props: {
    obj: { Name: 'upper' },
    k: 'name',
    keys: ['name', 'Name'],
  },
  expectedHtml: `
    <div bf-s="test" bf="s8">
      <span bf="s3"><!--bf:s0-->-<!--/-->|<!--bf:s1-->-<!--/-->|<!--bf:s2-->upper<!--/--></span>
      <span bf="s5"><!--bf:s4-->-<!--/--></span>
      <span bf="s7"><!--bf:s6-->1<!--/--></span>
    </div>
  `,
})
