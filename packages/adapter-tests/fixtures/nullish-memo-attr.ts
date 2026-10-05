import { createFixture } from '../src/types'

/**
 * Sibling of the shared `nullish-signal-attr` (#3304): an attribute bound
 * to a memo is omitted when the memo's SSR value is `undefined`, and
 * rendered for a present value — including `''` and `0` (#3322).
 */
export const fixture = createFixture({
  id: 'nullish-memo-attr',
  description: 'An attribute bound to a memo is omitted when the memo is nullish and rendered for present or falsy values',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

export function NullishMemoAttr() {
  const [s] = createSignal<string | undefined>(undefined)
  const [e] = createSignal('')
  const [n] = createSignal(0)
  const label = createMemo(() => s())
  const empty = createMemo(() => e())
  const zero = createMemo(() => n())
  const nested = createMemo(() => label())
  return (
    <div>
      <p className="nullish" title={label()}>a</p>
      <p className="empty" title={empty()}>b</p>
      <p className="zero" data-n={zero()}>c</p>
      <p className="nested" title={nested()}>d</p>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" class="nullish">a</p>
      <p bf="s1" class="empty" title="">b</p>
      <p bf="s2" class="zero" data-n="0">c</p>
      <p bf="s3" class="nested">d</p>
    </div>
  `,
})
