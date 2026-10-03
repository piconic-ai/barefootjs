import { createFixture } from '../src/types'

/**
 * Sibling of `const-boolean-conditional-test`: literal-initialized consts —
 * boolean, number and string, module and function scope — read in every
 * conditional shape (a negated test, a `&&` child, a numeric comparison) and
 * as plain text — including a module `null` const behind `??` and a string
 * holding a newline and a quote. A loop parameter named like an outer const
 * reads the row, not the const. (A text-position ternary is left to the
 * whitespace fixtures, `conditional-then-text` and siblings.)
 */
export const fixture = createFixture({
  id: 'literal-const-conditional-shapes',
  description: 'Literal consts select the right branch in every conditional shape; a same-named loop param reads the row',
  source: `
const enabled = false
const limit = 2
const missing = null
export function LiteralConstConditionalShapes() {
  const label = 'on'
  const multiline = 'a\\nb"c'
  const on = true
  const items = ['x', 'y']
  return (
    <div data-n={!enabled ? 'not' : 'yes'} data-limit={limit > 1 ? 'many' : 'one'}>
      {on && <b>shown</b>}
      {enabled && <i>hidden</i>}
      <em>{label}</em>
      <s>{missing ?? 'fallback'}</s>
      <small>{missing}</small>
      <q data-eq={multiline === 'a\\nb"c' ? 'same' : 'diff'}>{multiline}</q>
      {items.map(on => <u key={on}>{on}</u>)}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1" data-limit="many" data-n="not">
      <b>shown</b>
      <em>on</em>
      <s>fallback</s>
      <small></small>
      <q data-eq="same">a b&quot;c</q>
      <u data-key="x"><!--bf:s0-->x<!--/--></u>
      <u data-key="y"><!--bf:s0-->y<!--/--></u>
    </div>
  `,
})
