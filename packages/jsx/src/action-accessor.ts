/**
 * Structural recognition for a query/mutation action's reactive accessors
 * (#3166, part B of #3158): `action.isPending()` / `action.error()` where
 * `action` is the action binding of a recognised async factory
 * (`const [, fetchPosts] = createQuery(…)`, #3165's `SignalInfo.factory`).
 *
 * This is the ONE place that recognises the shape, fed directly by #3165's
 * binding metadata (`SignalInfo.factory.action`) rather than a name
 * heuristic — never re-derived per call site — and the ONE place that
 * decides where a recognised read may be seeded
 * ({@link seedableActionAccessorRead}). Two consumers call that gate:
 *
 * - `seedActionAccessorReads` (below, run by `jsx-to-ir.ts` right after the
 *   parse-attach walk): substitutes a gated read with its seed, both in the
 *   structured `ParsedExpr` every DSL adapter lowers from and in the
 *   `templateCondition` / `templateExpr` text the CSR module-scope fallback
 *   template reads.
 * - `async-action-refusal.ts` (BF117): lifts the refusal for exactly the
 *   positions the gate admits; every other read refuses as before #3166.
 *
 * Both walk the same positions (`walkTemplatePositions`), so the lift and
 * the seed cannot disagree about which position is which.
 *
 * Where the seed is sound. The SSR seed (spec/async.md §7.3) is `false` for
 * `isPending()` and `undefined` for `error()`; Hono (the reference) really
 * calls a stub returning exactly those, while a DSL adapter renders the
 * substituted `ParsedExpr` literal `false`. A position is gated in only where
 * the two provably render the same bytes:
 *
 * - a `condition` (`IRConditional` / `IRIfStatement`), for both accessors —
 *   only truthiness is observed, and `false` ≡ `undefined` there;
 * - an intrinsic element's ARIA boolean-state attribute
 *   ({@link ARIA_BOOLEAN_STATE_ATTRS}), for `isPending()` only — Hono renders
 *   `aria-busy={false}` as `aria-busy="false"`, and every DSL adapter
 *   stringifies a boolean there JS-style (`bool_str`).
 *
 * Everything else stays refused by BF117 exactly as before #3166, because the
 * seed would silently diverge there: a text child (`{fetchPosts.error()}` —
 * Hono renders nothing, a DSL adapter `false`), `error()` in any attribute
 * (Hono omits an `undefined` attribute; the `false` literal renders it), and
 * `isPending()` in any other attribute (Mojolicious / Xslate render the
 * literal as `0` outside the ARIA boolean set). A structured template
 * attribute's ternary condition (`class={fetchPosts.isPending() ? 'a' : 'b'}`)
 * is a truthiness test too, but its condition is raw text every adapter lowers
 * on its own, so there is nothing to substitute — it stays refused rather
 * than lifted with no seed behind it.
 *
 * #3210 (`createMutation`) reuses this unchanged — `SignalFactoryCall.kind`
 * only distinguishes how the value seeds, never how the action's accessors
 * do, so nothing here is query-specific.
 *
 * Scope: only the accessor called as the WHOLE template-position expression
 * is recognised. A compound use (`!fetchPosts.isPending()`,
 * `fetchPosts.isPending() && x`) is not substituted here and stays refused
 * by BF117 exactly as before #3166 — recognising it structurally too is
 * future work, not a silent gap: nothing that used to compile now compiles
 * differently, and nothing that used to refuse now silently mis-renders.
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { IRNode, SignalInfo } from './types.ts'
import { walkTemplatePositions, type TemplatePosition } from './template-position-walk.ts'

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
 * ARIA boolean-state attributes: the attribute names on which every DSL
 * adapter stringifies a boolean value JS-style (`"true"` / `"false"`), which
 * is what Hono renders for `aria-*={false}`. Must stay a subset of each DSL
 * adapter's own `isAriaBooleanAttr` set (Mojolicious / Xslate render a bare
 * `false` literal as `0` on any other attribute); `create-query.test.ts`
 * pins that across every adapter, so an adapter dropping a name fails there
 * instead of silently diverging.
 */
export const ARIA_BOOLEAN_STATE_ATTRS: ReadonlySet<string> = new Set([
  'aria-atomic',
  'aria-busy',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-hidden',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-pressed',
  'aria-readonly',
  'aria-required',
  'aria-selected',
])

/**
 * THE gate (see the file header): the recognised accessor read at this
 * template position, if its seed renders there exactly as Hono renders the
 * real stub's value — otherwise `null`, and the read stays refused (BF117).
 * `seedActionAccessorReads` seeds exactly what this admits, and BF117 lifts
 * exactly what this admits; neither re-decides it.
 */
export function seedableActionAccessorRead(
  position: Pick<TemplatePosition, 'expr' | 'role' | 'attrName'>,
  actions: ReadonlySet<string>,
): ActionAccessorRead | null {
  const read = matchActionAccessorCall(position.expr, actions)
  if (!read) return null
  switch (position.role) {
    case 'condition':
      return read
    case 'element-attr':
      return read.accessor === 'isPending' &&
        position.attrName !== undefined &&
        ARIA_BOOLEAN_STATE_ATTRS.has(position.attrName)
        ? read
        : null
    default:
      return null
  }
}

/**
 * Seed every gated accessor read in `root` in place: the position's
 * `ParsedExpr` (what DSL adapters lower) becomes {@link actionAccessorSeedParsed},
 * and its CSR fallback text (`templateCondition` / `templateExpr`) becomes
 * {@link actionAccessorSeedText}. Runs once, after `parsed` is attached and
 * before any refusal pass or adapter reads the IR.
 */
export function seedActionAccessorReads(root: IRNode, signals: readonly Pick<SignalInfo, 'factory'>[]): void {
  const actions = collectActionNames(signals)
  if (actions.size === 0) return
  walkTemplatePositions(root, (position) => {
    const read = seedableActionAccessorRead(position, actions)
    if (!read || !position.host) return
    const parsed = actionAccessorSeedParsed(read.accessor)
    const text = actionAccessorSeedText(read.accessor)
    if (position.host.kind === 'condition') {
      position.host.node.parsedCondition = parsed
      position.host.node.templateCondition = text
    } else {
      position.host.value.parsed = parsed
      position.host.value.templateExpr = text
    }
  })
}

/**
 * The SSR seed for a recognised accessor (spec/async.md §7.3): `isPending()`
 * is `false`; `error()` is `undefined`. Represented as the `ParsedExpr`
 * boolean literal `false` for the structured tree every DSL adapter's
 * expression lowering reads (`IRConditional.parsedCondition` /
 * `ExpressionAttr.parsed`). That is only equivalent to the real value where
 * {@link seedableActionAccessorRead} admits the position: a truthiness test
 * (`false` ≡ `undefined`), or `isPending()` (really `false`) in an ARIA
 * boolean-state attribute. Unlike the `null` literal, `false` is valid in
 * every position every adapter's grammar accepts, including a bare
 * `{{if …}}` command (Go's `text/template` rejects a bare `nil` there — "nil
 * is not a command"). `ParsedExpr`'s `literal` kind has no `undefined`
 * variant regardless, so something has to stand in for it; an `error()` read
 * rendered as a VALUE would need a real "omit" seed, which is why the gate
 * refuses it instead.
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
