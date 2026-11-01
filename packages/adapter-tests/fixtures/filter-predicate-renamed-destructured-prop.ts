import { createFixture } from '../src/types'

/**
 * #3845 sibling: a renamed parameter-destructured prop (`skip: drop`) read
 * only inside a loop's `.filter()` predicate, with a number value. The
 * client template runs at module scope, so the predicate must read the
 * caller's key (`_p.skip`), not the bare local `drop`.
 */
export const fixture = createFixture({
  id: 'filter-predicate-renamed-destructured-prop',
  description: 'a renamed destructured prop read only in a .filter() predicate (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function FilterPredicateRenamedDestructuredProp({ items, skip: drop }: { items: number[]; skip: number }) {
  const [n, setN] = createSignal(0)
  return (
    <div>
      <ul>{items.filter(v => v !== drop).map(v => <li key={v}>{v}</li>)}</ul>
      <button onClick={() => setN(n() + 1)}>{n()}</button>
    </div>
  )
}
`,
  props: { items: [1, 2.5, 3, 4], skip: 3 },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="1"><!--bf:s0-->1<!--/--></li>
        <li data-key="2.5"><!--bf:s0-->2.5<!--/--></li>
        <li data-key="4"><!--bf:s0-->4<!--/--></li>
      </ul>
      <button bf="s3"><!--bf:s2-->0<!--/--></button>
    </div>
  `,
})
