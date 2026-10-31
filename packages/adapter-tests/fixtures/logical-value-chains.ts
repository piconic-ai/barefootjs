import { createFixture } from '../src/types'

/**
 * Long value-position `&&` / `||` chains (#3824). JS `a || b || c …` parses
 * left-associated, so each `||` has the whole chain so far as its left
 * operand. A spelling that renders the left operand twice (once as the test,
 * once as the value it returns) doubles the template at every link, so a
 * 16-operand chain grew to megabytes; every adapter now renders each operand
 * once (`logical-value-chain-size.test.ts` guards the size).
 *
 * The chains run through falsy payloads (`0`, `''`, `null`): `||` must skip
 * each by its JS truthiness and `&&` must return the first one itself
 * (`0 && x` is `0`). `nil && nil.k` and `zero && nil.k` read `.k` off null on
 * the side the short circuit skips.
 */
export const fixture = createFixture({
  id: 'logical-value-chains',
  description: 'A 16-operand `||` / `&&` chain and mixed chains keep JS operand values, truthiness and the short circuit',
  source: `
'use client'

export function LogicalValueChains({ zero, empty, nil, s, t }: {
  zero: number
  empty: string
  nil?: { k: string } | null
  s: string
  t: string
}) {
  return (
    <div
      data-or16={zero || empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || s}
      data-or16-falsy={empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || empty || zero}
      data-and16={s && t && s && t && s && t && s && t && s && t && s && t && s && zero && t && s}
      data-and16-truthy={s && t && s && t && s && t && s && t && s && t && s && t && s && t && s && t}
      data-mixed={zero && s || empty && s || nil || s && t}
      data-mixed-falsy={(s || zero) && (nil || empty)}
      data-mixed-nested={((zero || s) && (empty || t)) || (s && zero) || empty}
      data-and-zero={zero && nil.k}
      data-nil-guard={nil && nil.k}
      data-or-guard={s || nil.k}
    >
      <span>[{zero || empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || zero || empty || nil || s}]</span>
      <span>[{empty || nil || zero}]</span>
      <span>[{zero && s || empty && s || nil || s && t}]</span>
    </div>
  )
}
`,
  props: {
    zero: 0,
    empty: '',
    nil: null,
    s: 's',
    t: 't',
  },
  expectedHtml: `
    <div bf-s="test" bf="s6" data-and-zero="0" data-and16-truthy="t" data-and16="0" data-mixed-falsy="" data-mixed-nested="t" data-mixed="t" data-or-guard="s" data-or16-falsy="0" data-or16="s">
      <span bf="s1">[<!--bf:s0-->s<!--/-->]</span>
      <span bf="s3">[<!--bf:s2-->0<!--/-->]</span>
      <span bf="s5">[<!--bf:s4-->t<!--/-->]</span>
    </div>
  `,
})
