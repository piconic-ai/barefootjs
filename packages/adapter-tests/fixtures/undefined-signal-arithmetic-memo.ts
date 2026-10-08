import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-signal-arithmetic-memo` (#3350): arithmetic over a
 * signal whose SSR value is `undefined` renders JS's `NaN`, since
 * `ToNumber(undefined)` is `NaN` where `ToNumber(null)` is `0`.
 */
export const fixture = createFixture({
  id: 'undefined-signal-arithmetic-memo',
  description: 'A memo computing arithmetic over an undefined-initialized signal renders NaN',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function UndefinedSignalArithmeticMemo() {
  const [s] = createSignal<any>(undefined)
  const doubled = createMemo(() => s() * 2)
  return <p data-n={doubled()}>x</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s0" data-n="NaN">x</p>
  `,
})
