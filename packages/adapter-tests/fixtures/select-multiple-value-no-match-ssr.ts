import { createFixture } from '../src/types'

/**
 * `<select multiple value={signal()}>` whose value matches no `<option>`
 * (companion to `select-value-no-match-ssr`, #2758).
 *
 * A list-box (`multiple`, or `size` > 1) has no implicit "select the first
 * item" default the way a single-selection `<select>` does — an unmatched
 * value already leaves the browser with nothing selected, so SSR and
 * hydration already agree without help. The placeholder-option fix must
 * NOT apply here: injecting a hidden option into a list box would still be
 * a visible (if empty) row once the box is opened.
 */
export const fixture = createFixture({
  id: 'select-multiple-value-no-match-ssr',
  description: 'A `multiple` select with an out-of-range value gets no placeholder option (#2758)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function OutOfRangeMultiSelect() {
  const [val] = createSignal(7)
  return (
    <select multiple value={val()}>
      <option value="0">Zero</option>
      <option value="1">One</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s0" multiple>
      <option value="0">Zero</option>
      <option value="1">One</option>
    </select>
  `,
})
