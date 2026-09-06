import { createFixture } from '../src/types'

/**
 * Controlled `<select value={signal()}>` whose bound value matches none of
 * the `<option>`s (#2758).
 *
 * Before the fix: SSR marked no `<option>` `selected` (no per-option
 * comparison matched), so the browser fell back to its own default — the
 * FIRST option. Hydration's controlled-value effect then assigned
 * `select.value` directly, and a value matching no option yields
 * `selectedIndex = -1` (nothing selected) — so the page rendered showing
 * the first option, and the moment hydration ran the selection visibly
 * disappeared.
 *
 * FIXED: when every `<option>` is statically enumerable (no `.map()` loop —
 * see `select-loop-selected` for that case, left as a follow-up), SSR now
 * also emits a hidden, disabled placeholder `<option value="">` whose own
 * `selected` is the negation of every real option's match condition ORed
 * together. It is selected only when nothing else is — reproducing the
 * client's "no match" reading instead of the browser's implicit
 * first-option default, so SSR and hydration agree.
 */
export const fixture = createFixture({
  id: 'select-value-no-match-ssr',
  description: 'Controlled select with an out-of-range value SSRs "nothing selected" (#2758)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function OutOfRangeSelect() {
  const [val] = createSignal(7)
  return (
    <select value={val()}>
      <option value="0">Zero</option>
      <option value="1">One</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s0">
      <option disabled hidden selected value=""></option>
      <option value="0">Zero</option>
      <option value="1">One</option>
    </select>
  `,
})
