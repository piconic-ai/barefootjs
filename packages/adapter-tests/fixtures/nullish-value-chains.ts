import { createFixture } from '../src/types'

/**
 * Long value-position `??` chains (#3839). JS `a ?? b ?? c …` parses
 * left-associated, so each `??` has the whole chain so far as its left
 * operand. A spelling that renders the left operand more than once (Jinja and
 * MiniJinja three times, ERB and Twig twice) grows the template
 * exponentially; every adapter now renders each operand once
 * (`logical-value-chain-size.test.ts` guards the size).
 *
 * The chains run through `null` and omitted props and must stop at the first
 * present operand, including the falsy ones (`0`, `''`, `false`). Loop rows
 * leave fields out, so an absent key (Jinja's `Undefined`) falls through as
 * `null` does. `zero ?? nil.k` reads `.k` off null on the side the short
 * circuit skips. Mixed chains put `||` on either side of `??`.
 */
export const fixture = createFixture({
  id: 'nullish-value-chains',
  description: 'A 16-operand `??` chain and mixed chains stop at the first non-nullish operand, including 0, "" and false',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

type Row = { k: string; a?: string | number | null; b?: string | number | null; c?: string | null }

export function NullishValueChains({ zero, empty, no, nil, omitted, s, rows }: {
  zero: number
  empty: string
  no: boolean
  nil?: { k: string } | null
  omitted?: string
  s: string
  rows: Row[]
}) {
  const memoChain = createMemo(() => nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? empty)
  return (
    <div
      data-to-s={nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? s}
      data-to-zero={nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? zero ?? s}
      data-to-empty={omitted ?? nil ?? empty ?? s}
      data-to-no={nil ?? no ?? s}
      data-first={s ?? nil ?? omitted ?? zero}
      data-all-nil={nil ?? omitted ?? nil ?? null}
      data-skip={zero ?? nil.k}
      data-or-left={(nil ?? zero) || s}
      data-or-right={nil ?? (zero || s)}
      data-or-inner={(nil || zero) ?? s}
      data-and-inner={(s && nil) ?? omitted ?? empty}
    >
      <span>[{nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? omitted ?? nil ?? s}]</span>
      <span>[{omitted ?? nil ?? zero ?? s}][{nil ?? omitted ?? empty ?? s}][{memoChain()}]</span>
      <ul>{rows.map(r => <li key={r.k} data-v={\`\${r.a ?? r.b ?? r.c ?? 'fb'}\`}>{r.a ?? r.b ?? r.c ?? 'fb'}</li>)}</ul>
    </div>
  )
}
`,
  props: {
    zero: 0,
    empty: '',
    no: false,
    nil: null,
    s: 's',
    rows: [
      { k: 'none' },
      { k: 'a-nil', a: null, b: 0 },
      { k: 'b-empty', b: '' },
      { k: 'c', a: null, b: null, c: 'c' },
      { k: 'a', a: 'a', b: 'b' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-and-inner="" data-first="s" data-or-inner="0" data-or-left="s" data-or-right="s" data-skip="0" data-to-empty="" data-to-no="false" data-to-s="s" data-to-zero="0">
      <span bf="s1">[<!--bf:s0-->s<!--/-->]</span>
      <span bf="s5">[<!--bf:s2-->0<!--/-->][<!--bf:s3--><!--/-->][<!--bf:s4--><!--/-->]</span>
      <ul bf="s8">
        <li bf="s7" data-key="none" data-v="fb"><!--bf:s6-->fb<!--/--></li>
        <li bf="s7" data-key="a-nil" data-v="0"><!--bf:s6-->0<!--/--></li>
        <li bf="s7" data-key="b-empty" data-v=""><!--bf:s6--><!--/--></li>
        <li bf="s7" data-key="c" data-v="c"><!--bf:s6-->c<!--/--></li>
        <li bf="s7" data-key="a" data-v="a"><!--bf:s6-->a<!--/--></li>
      </ul>
    </div>
  `,
})
