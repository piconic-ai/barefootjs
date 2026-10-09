import { createFixture } from '../src/types'

/**
 * Sibling of `undefined-signal-arithmetic-memo` (#3390): the `NaN` from
 * arithmetic over an `undefined`-initialized signal survives a memo chain and
 * an explicit `number` type argument — an identity memo read in arithmetic
 * (`same() * 2`), arithmetic over an arithmetic memo (`doubled() * 2`), and
 * `createMemo<number>`. Adapters that seed memos at compile time must not
 * read the undefined operand as `0` at any link.
 */
export const fixture = createFixture({
  id: 'undefined-signal-arithmetic-memo-chains',
  description: 'Arithmetic over an undefined-initialized signal renders NaN through memo chains and a number-typed memo',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function UndefinedSignalArithmeticMemoChains() {
  const [s] = createSignal<any>(undefined)
  const same = createMemo(() => s())
  const viaIdentity = createMemo(() => same() * 2)
  const doubled = createMemo(() => s() * 2)
  const viaArithmetic = createMemo(() => doubled() * 2)
  const typed = createMemo<number>(() => s() * 2)
  return <p data-a={viaIdentity()} data-b={viaArithmetic()} data-c={typed()}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-a="NaN" data-b="NaN" data-c="NaN">x</p>
  `,
})
