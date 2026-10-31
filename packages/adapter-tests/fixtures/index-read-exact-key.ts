import { createFixture } from '../src/types'

/**
 * An object index read matches its key exactly (#3824 step 2): `obj['ID']`
 * on `{ id: 'present' }` reads `undefined`, as do the case variants `Id` and
 * `iD`, in a template read, a memo body and a `.filter()` predicate. A
 * backend that retries case variants of a map key (Go's struct-field
 * accommodation) must not apply it to an index read.
 */
export const fixture = createFixture({
  id: 'index-read-exact-key',
  description: 'An object index read matches its key exactly, with no case-variant retry, in templates and callbacks',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

export function IndexReadExactKey({ obj, k, keys }: {
  obj: Record<string, string>
  k: string
  keys: string[]
}) {
  const picked = createMemo(() => obj[k] ?? '-')
  return (
    <div data-v={obj[k]}>
      <span>{obj[k] ?? '-'}|{obj['ID'] ?? '-'}|{obj['Id'] ?? '-'}|{obj['id'] ?? '-'}</span>
      <span>{picked()}</span>
      <span>{keys.filter(key => obj[key]).length}</span>
    </div>
  )
}
`,
  props: {
    obj: { id: 'present' },
    k: 'ID',
    keys: ['ID', 'Id', 'iD', 'id'],
  },
  expectedHtml: `
    <div bf-s="test" bf="s9">
      <span bf="s4"><!--bf:s0-->-<!--/-->|<!--bf:s1-->-<!--/-->|<!--bf:s2-->-<!--/-->|<!--bf:s3-->present<!--/--></span>
      <span bf="s6"><!--bf:s5-->-<!--/--></span>
      <span bf="s8"><!--bf:s7-->1<!--/--></span>
    </div>
  `,
})
