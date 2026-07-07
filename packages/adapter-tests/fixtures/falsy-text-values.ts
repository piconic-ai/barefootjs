import { createFixture } from '../src/types'

/**
 * JSX falsy-rendering semantics for literal expression children.
 *
 * React/Solid semantics: `0` renders as text "0"; `false`, `null`,
 * `undefined`, and `''` render nothing. An adapter that stringifies
 * naively (Go's `fmt.Sprint(false)` → "false", Ruby's `nil.to_s` → "",
 * Python's `str(None)` → "None") diverges visibly here.
 */
export const fixture = createFixture({
  id: 'falsy-text-values',
  description: 'Falsy literal children: 0 renders, false/null/undefined/empty-string do not',
  source: `
export function FalsyTextValues() {
  return (
    <div>
      <span>{0}</span>
      <span>{false}</span>
      <span>{null}</span>
      <span>{undefined}</span>
      <span>{''}</span>
      <span>{1}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <span>0</span>
      <span></span>
      <span>null</span>
      <span>null</span>
      <span></span>
      <span>1</span>
    </div>
  `,
})
