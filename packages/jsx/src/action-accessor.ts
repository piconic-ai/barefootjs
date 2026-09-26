/**
 * Structural recognition for a query/mutation action's reactive accessors
 * (#3166, part B of #3158): `action.isPending()` / `action.error()` where
 * `action` is the action binding of a recognised async factory
 * (`const [, fetchPosts] = createQuery(…)`, #3165's `SignalInfo.factory`).
 *
 * This is the ONE place that recognises the shape, fed directly by #3165's
 * binding metadata (`SignalInfo.factory.action`) rather than a name
 * heuristic — never re-derived per call site. Two independent consumers
 * share it:
 *
 * - `async-action-refusal.ts` (BF117): a direct accessor read no longer
 *   refuses — the seed makes it an ordinary, IR-visible value.
 * - `jsx-to-ir.ts` (`attachParsedExpressions` / `rewriteBarePropRefs`):
 *   substitutes the recognised call with its seed, both in the structured
 *   `ParsedExpr` tree every DSL adapter lowers from, and in the props-
 *   rewritten template text the CSR module-scope fallback falls back to.
 *
 * #3210 (`createMutation`) reuses this unchanged — `SignalFactoryCall.kind`
 * only distinguishes how the value seeds, never how the action's accessors
 * do, so nothing here is query-specific.
 *
 * Scope: only the accessor called as the WHOLE template-position expression
 * (`aria-busy={fetchPosts.isPending()}`, `{fetchPosts.error() ? … : null}`)
 * is recognised. A compound use (`!fetchPosts.isPending()`,
 * `fetchPosts.isPending() && x`) is not substituted here and stays refused
 * by BF117 exactly as before #3166 — recognising it structurally too is
 * future work, not a silent gap: nothing that used to compile now compiles
 * differently, and nothing that used to refuse now silently mis-renders.
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { SignalInfo } from './types.ts'

/** Reactive accessors every recognised action carries (spec/async.md §7.1/§7.3). */
export type ActionAccessorName = 'isPending' | 'error'

/**
 * Exported so every consumer that needs the accessor-name set (not just the
 * whole-expression-call recognition below) reads the same one — mirrors the
 * `Reactive` members of `QueryAction` in `packages/client/src/create-query.ts`:
 * an accessor added there must be added here.
 */
export const ACTION_ACCESSOR_NAMES: ReadonlySet<string> = new Set(['isPending', 'error'])

export interface ActionAccessorRead {
  action: string
  accessor: ActionAccessorName
}

/** The action bindings a component's recognised async factories produced (#3165). */
export function collectActionNames(signals: readonly Pick<SignalInfo, 'factory'>[]): ReadonlySet<string> {
  const actions = new Set<string>()
  for (const signal of signals) {
    if (signal.factory?.action) actions.add(signal.factory.action)
  }
  return actions
}

/**
 * Recognises `<action>()` — a zero-arg call whose callee is a non-computed
 * member access on an identifier in `actions`, naming `isPending` or
 * `error`. Structural: never matches on the property name alone without the
 * object also being a real recognised action binding.
 */
export function matchActionAccessorCall(
  expr: ParsedExpr,
  actions: ReadonlySet<string>,
): ActionAccessorRead | null {
  if (expr.kind !== 'call' || expr.args.length !== 0) return null
  const callee = expr.callee
  if (callee.kind !== 'member' || callee.computed) return null
  if (callee.object.kind !== 'identifier') return null
  if (!actions.has(callee.object.name)) return null
  if (!ACTION_ACCESSOR_NAMES.has(callee.property)) return null
  return { action: callee.object.name, accessor: callee.property as ActionAccessorName }
}

/**
 * The SSR seed for a recognised accessor (spec/async.md §7.3): `isPending()`
 * is `false`; `error()` is `undefined`. Represented as the `ParsedExpr`
 * boolean literal `false` for the structured tree every DSL adapter's
 * expression lowering reads (`IRConditional.parsedCondition` /
 * `ExpressionAttr.parsed`) — both recognised uses in this pass are
 * truthiness checks (a conditional test, an ARIA boolean attribute), where
 * `false` and `undefined` are indistinguishable, and unlike the `null`
 * literal, `false` is valid in every position every adapter's grammar
 * accepts, including a bare `{{if …}}` command (Go's `text/template` rejects
 * a bare `nil` there — "nil is not a command" — since `nil` is a value only
 * a pipeline ARGUMENT position accepts, not a command by itself; `false` has
 * no such restriction anywhere). `ParsedExpr`'s `literal` kind has no
 * `undefined` variant regardless, so something has to stand in for it here.
 * A future `error()` read used as a plain rendered VALUE (not just tested)
 * would want a real "omit" seed instead — out of scope for the fixtures
 * this pass covers (conditional test / boolean-attribute test only).
 */
export function actionAccessorSeedParsed(_accessor: ActionAccessorName): ParsedExpr {
  return { kind: 'literal', value: false, literalType: 'boolean' }
}

/**
 * The SSR seed as JS source text — for the CSR module-scope fallback
 * template (`templateCondition` / `templateExpr`), which cannot close over
 * the action's real accessor (it is a local inside `initX`, never in scope
 * at module level, the same reason a signal getter call is substituted with
 * its initial value there instead of being called live).
 */
export function actionAccessorSeedText(accessor: ActionAccessorName): string {
  return accessor === 'isPending' ? 'false' : 'undefined'
}
