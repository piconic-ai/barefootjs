import { createFixture } from '../src/types'

/**
 * `??` used as an operand inside a CONDITION (a ternary test that lowers to
 * Go's `{{if …}}`), either directly as a comparison operand or underneath
 * `.length` (#3249).
 *
 * `nullish-coalescing-text` / `-jsx` / `-destructured` all cover `??` in a
 * VALUE position (the thing that gets rendered). This fixture is the sibling
 * gap in a boolean-TEST position: the Go adapter's `renderConditionExpr`
 * lowers a `??` operand to a bare `or …`/`bf_nullish …` call (via its
 * `logical` arm) and used to splice it UNPARENTHESISED into the enclosing
 * comparison/`len` — `gt (len or .Todos bf_arr) 0`, `gt or .Count 0 0` — which
 * `html/template` parses as extra sibling arguments and fails at RENDER time
 * ("wrong number of args"), not at compile time. Compilation reported no
 * error, so only an actual Go render (not just inspecting the emitted
 * template text) proves the fix.
 *
 * Three shapes from the issue, all through the same two `renderConditionExpr`
 * arms (`binary`, `member` `.length`) — the issue's fourth shape
 * (`props.meta?.count ?? 0`, a NESTED object prop) hits an unrelated,
 * pre-existing gap (a synthesized nested-object prop type is never wired
 * into the generated struct field, which stays a generic
 * `map[string]interface{}` that `.Field` can't index case-sensitively) and
 * is deliberately NOT reproduced here; `props.count` (a plain optional
 * SCALAR prop) exercises the identical `renderConditionExpr` arm without
 * that confound:
 *   - `(todos() ?? []).length > 0`   — `.length`'s OBJECT is `??`
 *   - `(todos()?.length ?? 0) > 0`   — `>`'s LEFT operand is `??`
 *   - `(props.count ?? 0) > 0`       — same, over an optional scalar prop
 *   - `(props.count ?? 0) === 2`     — same, through the `eq` arm
 *
 * Seeds are chosen so every branch actually flips truthy across the two data
 * points, so a template that merely fails to PARSE (rather than mis-evaluate)
 * cannot pass by accident — Go must both parse AND render it correctly.
 */
export const fixture = createFixture({
  id: 'nullish-coalescing-condition-operand',
  description: '`??` as a condition operand (comparison and .length) lowers to a valid, correct template (#3249)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Todo = { id: number; done: boolean }
type Props = { initialTodos?: Todo[]; count?: number }
export function NullishCoalescingConditionOperand(props: Props) {
  const [todos] = createSignal<Todo[] | undefined>(props.initialTodos)
  return (
    <div>
      <span>{(todos() ?? []).length}</span>
      <span>{(todos() ?? []).length > 0 ? 'a' : 'z'}</span>
      <span>{(todos()?.length ?? 0) > 0 ? 'b' : 'z'}</span>
      <span>{(props.count ?? 0) > 0 ? 'has' : 'none'}</span>
      <span>{(props.count ?? 0) === 2 ? 'two' : 'not-two'}</span>
    </div>
  )
}
`,
  props: { initialTodos: [{ id: 1, done: false }], count: 2 },
  dataPoints: [
    { name: 'empty-todos-no-count', props: {} },
    // `??` is nullish-KEPT: a present-but-zero `count` must NOT fall back to
    // the `?? 0` default and must NOT satisfy `> 0`.
    { name: 'zero-count', props: { initialTodos: [], count: 0 } },
  ],
  expectedHtml: `
    <div bf-s="test">
      <span bf="s1"><!--bf:s0-->1<!--/--></span>
      <span bf="s3"><!--bf-cond-start:s2-->a<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf-cond-start:s4-->b<!--bf-cond-end:s4--></span>
      <span bf="s7"><!--bf-cond-start:s6-->has<!--bf-cond-end:s6--></span>
      <span bf="s9"><!--bf-cond-start:s8-->two<!--bf-cond-end:s8--></span>
    </div>
  `,
})
