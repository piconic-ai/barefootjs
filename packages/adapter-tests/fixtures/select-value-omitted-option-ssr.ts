import { createFixture } from '../src/types'

/**
 * Controlled `<select value={signal()}>` where one `<option>` has NO `value`
 * attribute at all — the browser falls back to that option's text content as
 * its implicit value (#2758 follow-up, found in review).
 *
 * `distribute()` (`lowerFormControlValueSsr`, `jsx-to-ir.ts`) can't compare
 * the bound value against an implicit text-content value without
 * re-deriving that text, so it bails out of the "no match" placeholder
 * aggregate entirely (`optionSetIsDynamic = true`) rather than silently
 * dropping this option from the OR — which would otherwise let the
 * placeholder be marked `selected` even though this option might actually
 * be the real match once the browser (or hydration) resolves its implicit
 * value. No placeholder is injected here; behavior for this mixed shape
 * stays exactly what it was before #2758 (ambiguous-but-not-wrong).
 */
export const fixture = createFixture({
  id: 'select-value-omitted-option-ssr',
  description: 'A value-less <option> bails the no-match placeholder instead of being silently dropped (#2758 follow-up)',
  source: `
"use client"
import { createSignal } from '@barefootjs/client'

export function MixedValuelessSelect() {
  const [val] = createSignal('a')
  return (
    <select value={val()}>
      <option>Implicit</option>
      <option value="a">A</option>
    </select>
  )
}
`,
  expectedHtml: `
    <select bf-s="test" bf="s0">
      <option>Implicit</option>
      <option selected value="a">A</option>
    </select>
  `,
})
