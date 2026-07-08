import { createFixture } from '../src/types'

/**
 * JSX falsy-rendering semantics for literal expression children.
 *
 * React/Solid semantics: `0` renders as text "0"; `false`, `null`,
 * `undefined`, and `''` render nothing. Since #2171 the render-nothing
 * literals (`null` / `undefined` / `true` / `false`) are folded away in
 * Phase 1 (`jsx-to-ir`'s `isRenderNothingLiteral`), so the IR carries
 * no node for them and every adapter agrees by construction — this
 * fixture pins that the fold holds end-to-end on every backend.
 * (Pre-#2171 each adapter stringified the literal its own way: the
 * Hono reference emitted the text "null", template backends emitted
 * "false" for `{false}` — the original Priority-12 divergence.)
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
      <span></span>
      <span></span>
      <span></span>
      <span>1</span>
    </div>
  `,
})
