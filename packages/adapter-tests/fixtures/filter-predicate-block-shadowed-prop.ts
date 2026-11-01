import { createFixture } from '../src/types'

/**
 * #3845 review: a block-bodied `.filter()` predicate that reads a
 * destructured prop at its top and declares a `const` of the same name in a
 * nested block. The client template runs at module scope, so the outer read
 * must become `_p.one` while the inner binding and its read keep their
 * names. The scope-blind regex fallback produced `const _p.one = 'a'`, an
 * invalid client module, so a client-side mount failed.
 *
 * `a` passes through the inner binding (`one` is `'a'` there) and `b`
 * through the prop: a template that read the prop inside the nested block
 * would drop `a`.
 */
export const fixture = createFixture({
  id: 'filter-predicate-block-shadowed-prop',
  description: 'a block-bodied .filter() predicate that shadows a destructured prop in a nested block (#3845)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function FilterPredicateBlockShadowedProp({ keys, one }: { keys: string[]; one: string }) {
  const [n, setN] = createSignal(0)
  return (
    <div>
      <ul>{keys.filter(k => {
        const v = one
        if (k === 'a') {
          const one = 'a'
          return k === one
        }
        return k === v
      }).map(k => <li key={k}>{k}</li>)}</ul>
      <button onClick={() => setN(n() + 1)}>{n()}</button>
    </div>
  )
}
`,
  props: { keys: ['a', 'b', 'c'], one: 'b' },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="a"><!--bf:s0-->a<!--/--></li>
        <li data-key="b"><!--bf:s0-->b<!--/--></li>
      </ul>
      <button bf="s3"><!--bf:s2-->0<!--/--></button>
    </div>
  `,
})
