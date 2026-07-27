/**
 * Stringify a `ReactiveEffectsPlan` into source lines.
 *
 * The stringifier is a deterministic walk: every wrap and every partition
 * decision was already made by `buildReactiveEffectsPlan`. Conditional arm
 * bodies (events, child component inits, inner loops, nested conditionals,
 * branch-scoped texts) flow through the per-arm stringifiers in
 * `loop-child-arm.ts` — no legacy passthrough remains.
 */

import { varSlotId, profileBindingId } from '../../utils.ts'
import { emitAttrUpdate } from '../../emit-reactive.ts'
import { stringifyLoopChildArm } from './loop-child-arm.ts'
import { claimPlanLiteral, claimWriterVarName, type ClaimSlotSpec } from './claim-plan.ts'
import type {
  NestedConditionalPlan,
  ReactiveEffectsPlan,
  ReactiveTextEffect,
} from '../plan/reactive-effects.ts'

export interface StringifyReactiveEffectsOptions {
  /** Indent prefix for every emitted line. */
  indent: string
  /**
   * Element variable to attach effects to (e.g., `__el`, `__existing`,
   * `__csrEl`). The stringifier never inspects it — it is simply substituted
   * into the qsa() / lazySlots() / insert() call shapes.
   */
  elVar: string
  /**
   * When true, the loop body is a multi-root JSX Fragment (#1212) and the
   * reactive attribute slots may live on sibling roots of `elVar`, not
   * descendants. Switches the slot lookup from `qsa` (root-or-descendant
   * scoped to one element) to `qsaItem` (walks past `elVar` and its
   * `<!--bf-loop-i-->`-bounded siblings). Optional — defaults to `false`.
   */
  bodyIsMultiRoot?: boolean
  /**
   * Compile-time `__p` index for each attr slotId (perf, #2143) — see
   * `buildSkeletonPathPlan`. When a slot has an entry, the emitted lookup
   * becomes `__p ? __p[i] : qsa(...)` instead of the bare `qsa(...)` call;
   * `__p` is `null` on the hydration branch (`__existing`), so hydration
   * still resolves through the battle-tested runtime lookup.
   */
  elementIndexBySlot?: ReadonlyMap<string, number>
  /**
   * Rendered path EXPRESSION source (not a plain array — see
   * `ClaimSlotSpec.pathExpr`) for outer text slots, keyed by slotId: perf,
   * #2143's hoisted single-root loop skeleton
   * (`SkeletonSlotPaths.textMarkerPaths`), guarded by `__existing` the same
   * way `__p` is nulled on the hydration branch (the skeleton's simplified
   * markup doesn't describe the real SSR-rendered tree). Only
   * `stringifyPlainLoop`'s hoisted-skeleton path supplies these; every other
   * caller omits it and each text slot's claim-plan entry gets `path: []`
   * — A2's marker-scan fallback resolves it at claim time (sound, just
   * slower), per `spec/slot-unification.md` §5-A3's explicit "cannot be
   * statically pathed" allowance.
   */
  textClaimPathExprs?: ReadonlyMap<string, string>
}

export function stringifyReactiveEffects(
  lines: string[],
  plan: ReactiveEffectsPlan,
  opts: StringifyReactiveEffectsOptions,
): void {
  const { indent, elVar, bodyIsMultiRoot, elementIndexBySlot, textClaimPathExprs } = opts
  const lookup = bodyIsMultiRoot ? 'qsaItem' : 'qsa'
  const pc = plan.profileComponentName
  const bindingBfId = (slotId: string): string => profileBindingId(pc, slotId)

  // 1. Reactive attribute effects (one qsa per slot, then per-attr createEffect).
  for (const slot of plan.attrSlots) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    const pIdx = elementIndexBySlot?.get(slot.slotId)
    const lookupExpr = pIdx !== undefined
      ? `__p ? __p[${pIdx}] : ${lookup}(${elVar}, '[bf="${slot.slotId}"]')`
      : `${lookup}(${elVar}, '[bf="${slot.slotId}"]')`
    lines.push(`${indent}{ const ${varName} = ${lookupExpr}`)
    lines.push(`${indent}if (${varName}) {`)
    for (const attr of slot.attrs) {
      lines.push(`${indent}  createEffect(() => {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.wrappedExpression, attr.meta)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  }${bindingBfId(slot.slotId)})`)
    }
    lines.push(`${indent}} }`)
  }

  // 2. Outer text effects (slots NOT inside any conditional branch), via ONE
  //    claimed-slot writer covering every text slot in this scope (row-level
  //    claim, `spec/slot-unification.md` §3(a)/§5-A3). `lazySlots` touches
  //    nothing until the first `createEffect` fires, and that first write
  //    claims every slot in the plan at once.
  emitOuterTexts(lines, indent, elVar, plan.outerTexts, bindingBfId, textClaimPathExprs)

  // 3. Reactive conditionals — each emits an insert(...) over `elVar` whose
  //    arm bodies dispatch through the per-arm stringifiers.
  for (const cond of plan.conditionals) {
    emitOuterConditional(lines, indent, elVar, cond, pc)
  }
}

function emitOuterTexts(
  lines: string[],
  indent: string,
  elVar: string,
  texts: readonly ReactiveTextEffect[],
  bindingBfId: (slotId: string) => string,
  textClaimPathExprs?: ReadonlyMap<string, string>,
): void {
  if (texts.length === 0) return
  const slots: ClaimSlotSpec[] = texts.map(t => ({
    id: t.slotId,
    kind: 'text',
    path: [],
    pathExpr: textClaimPathExprs?.get(t.slotId),
  }))
  const writer = claimWriterVarName(slots, varSlotId)
  lines.push(`${indent}const ${writer} = lazySlots(${elVar}, ${claimPlanLiteral(slots)})`)
  for (const text of texts) {
    lines.push(`${indent}createEffect(() => { ${writer}('${text.slotId}', String(${text.wrappedExpression})) }${bindingBfId(text.slotId)})`)
  }
}

function emitOuterConditional(
  lines: string[],
  indent: string,
  elVar: string,
  cond: NestedConditionalPlan,
  pc: string | undefined,
): void {
  const armIndent = `${indent}    `

  // Body-form arrows so live `Node` returns from Child-position
  // interpolations route through `__bfSlot` and survive the splice (#1213).
  lines.push(`${indent}insert(${elVar}, '${cond.slotId}', () => ${cond.wrappedCondition}, {`)
  lines.push(`${indent}  template: () => { const __slots = []; return { html: \`${cond.whenTrueTemplateHtml}\`, slots: __slots } },`)
  lines.push(`${indent}  bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {`)
  stringifyLoopChildArm(lines, cond.whenTrueArm, armIndent, pc)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}, {`)
  lines.push(`${indent}  template: () => { const __slots = []; return { html: \`${cond.whenFalseTemplateHtml}\`, slots: __slots } },`)
  lines.push(`${indent}  bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {`)
  stringifyLoopChildArm(lines, cond.whenFalseArm, armIndent, pc)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}${profileBindingId(pc, cond.slotId)})`)
}
