import { createFixture } from '../src/types'

/**
 * A `+` whose operand can yield a comparison's boolean (`n > 0 && 2`, a
 * ternary with a boolean branch) and whose other operand Phase 1 cannot
 * type, so the runtime's JS `+` decides (#3824 step 4). JS turns the
 * boolean into `"false"` against a string and into `0` / `1` against a
 * number: `(n > 0 && 2) + x` is `"falsex"` for `n = 0`, `"2x"` for `n = 1`.
 */
export const fixture = createFixture({
  id: 'plus-boolean-branch-operand',
  description: 'A dynamic + over an operand that yields a comparison boolean prints and adds the boolean as JS does',
  source: `
export function PlusBooleanBranchOperand(props: { zero: number; one: number; x: string | number; k: string | number }) {
  return (
    <p data-v={(props.zero > 0 && 2) + props.x}>
      {(props.zero > 0 && 2) + props.x}|{(props.one > 0 && 2) + props.x}|{((props.zero > 0) ? 'y' : (props.one < 0)) + props.x}|{(props.zero > 0 || props.one > 0) + props.k}
    </p>
  )
}
`,
  props: { zero: 0, one: 1, x: 'x', k: 1 },
  expectedHtml: `
    <p bf-s="test" bf="s4" data-v="falsex"><!--bf:s0-->falsex<!--/-->|<!--bf:s1-->2x<!--/-->|<!--bf:s2-->falsex<!--/-->|<!--bf:s3-->2<!--/--></p>
  `,
})
