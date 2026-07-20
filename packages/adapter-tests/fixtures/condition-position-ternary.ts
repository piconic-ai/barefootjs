import { createFixture } from '../src/types'

/**
 * A ternary used as a boolean CONDITION (`(x ? y : z) ? … : …`), not as a
 * value. Pins the #2335 correctness fix: the Go adapter's condition-expression
 * lowering used to return only the ternary's `test`, silently discarding both
 * branches — a `(flag ? yes : no)` sub-condition collapsed to `flag`. It now
 * lowers faithfully via the pipeline `bf_ternary`, truthiness-checked by the
 * enclosing `{{if}}`.
 *
 * The seeds are chosen so the bug and the fix diverge visibly: `flag` is
 * truthy but selects `yes` which is FALSY, so the correct condition is false
 * (render "OFF"). The old test-only lowering would have seen `flag` (truthy)
 * and wrongly rendered "ON".
 */
export const fixture = createFixture({
  id: 'condition-position-ternary',
  description: 'Ternary as a boolean sub-condition lowers faithfully (#2335)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function ConditionPositionTernary() {
  const [flag, setFlag] = createSignal(true)
  const [yes, setYes] = createSignal(false)
  const [no, setNo] = createSignal(true)
  return <div>{(flag() ? yes() : no()) ? 'ON' : 'OFF'}</div>
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s1"><!--bf-cond-start:s0-->OFF<!--bf-cond-end:s0--></div>
  `,
})
