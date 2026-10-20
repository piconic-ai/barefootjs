import { createFixture } from '../src/types'

/**
 * A typed array memo over an array prop whose destructure default reads an
 * earlier array prop (`{ a, b = a }`, `createMemo<string[]>(() => b)`): the
 * memo holds a passed `b` as passed, and `a` when `b` is omitted.
 */
export const fixture = createFixture({
  id: 'destructure-default-array-memo',
  description: 'A typed array memo over an array prop defaulted to an earlier array prop holds the passed or the earlier value',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'
export function DestructureDefaultArrayMemo({ a, b = a }: { a: string[]; b?: string[] }) {
  const rows = createMemo<string[]>(() => b)
  return <p>{rows().length}</p>
}
`,
  props: { a: ['first'], b: ['explicit', 'second'] },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--></p>
  `,
  dataPoints: [
    { name: 'b-absent', props: { a: ['first'] } },
  ],
})
