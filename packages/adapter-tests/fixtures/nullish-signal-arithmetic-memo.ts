import { createFixture } from '../src/types'

/**
 * Sibling of `nullish-memo-attr` (#3322): a memo computing arithmetic over
 * a `null`-initialized signal (directly, or through an identity memo that
 * is itself nil) still builds and renders JS's `null * 2` = `0`.
 */
export const fixture = createFixture({
  id: 'nullish-signal-arithmetic-memo',
  description: 'A memo computing arithmetic over a null-initialized signal renders JS coercion, alongside an identity memo that stays nil',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

export function NullishSignalArithmeticMemo() {
  const [s] = createSignal<any>(null)
  const same = createMemo(() => s())
  const doubled = createMemo(() => s() * 2)
  const chained = createMemo(() => same() * 2)
  return (
    <div>
      <p className="same" title={same()}>a</p>
      <p className="doubled" data-n={doubled()}>b</p>
      <p className="chained" data-n={chained()}>c</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="same">a</p>
      <p bf="s1" class="doubled" data-n="0">b</p>
      <p bf="s2" class="chained" data-n="0">c</p>
    </div>
  `,
})
