import { createFixture } from '../src/types'

/**
 * Memo callbacks that are not a bare `() => expr` arrow: a `function`
 * expression with a single `return`, a multi-statement `function` body, and
 * a parenthesized arrow reading a destructured prop. The memo's value is
 * read from the callback node by the analyzer (`MemoInfo.bodyExpr`), not by
 * matching `() =>` in its text, so the CSR template substitutes the value
 * instead of the uncalled function and Go folds it instead of zeroing it
 * (#3510).
 */
export const fixture = createFixture({
  id: 'memo-function-expression',
  description: 'A `function` expression or parenthesized arrow memo callback renders its value',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function MemoFunctionExpression({ base }: { base: number }) {
  const [count, setCount] = createSignal(2)
  const tens = createMemo(function () { return count() * 10 })
  const tripled = createMemo(function () { const k = count(); return k * 3 })
  const plusBase = createMemo((() => count() + base))
  return (
    <button onClick={() => setCount(count() + 1)}>
      <span>{tens()}</span>
      <span>{tripled()}</span>
      <span>{plusBase()}</span>
    </button>
  )
}
`,
  props: { base: 5 },
  expectedHtml: `
    <button bf-s="test" bf="s6">
      <span bf="s1"><!--bf:s0-->20<!--/--></span>
      <span bf="s3"><!--bf:s2-->6<!--/--></span>
      <span bf="s5"><!--bf:s4-->7<!--/--></span>
    </button>
  `,
})
