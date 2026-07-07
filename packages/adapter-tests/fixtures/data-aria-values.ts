import { createFixture } from '../src/types'

/**
 * `data-*` / `aria-*` value typing: `data-count={0}` must render "0"
 * (NOT be dropped as falsy, and NOT canonicalise to "false"),
 * `aria-hidden={true}` must render the string "true" (ARIA booleans
 * are tri-state strings, not HTML boolean attributes), and a numeric
 * `aria-level` renders its digits.
 */
export const fixture = createFixture({
  id: 'data-aria-values',
  description: 'data-*/aria-* value typing: numeric zero, ARIA string-booleans',
  source: `
export function DataAriaValues() {
  return (
    <div data-count={0} data-active={true} aria-hidden={true}>
      <h2 aria-level={3} aria-disabled={false}>heading</h2>
    </div>
  )
}
`,
  expectedHtml: `
    <div aria-hidden="true" bf-s="test" data-active="true" data-count="0"><h2 aria-disabled="false" aria-level="3">heading</h2></div>
  `,
})
