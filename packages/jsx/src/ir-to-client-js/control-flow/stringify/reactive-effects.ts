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
import {
  stringifyBranchChildComponentInits,
  stringifyBranchEventBindings,
  stringifyBranchInnerLoops,
  stringifyBranchReactiveAttrs,
  stringifyLoopChildConditionals,
} from './loop-child-arm.ts'
import type { LoopChildArmPlan, LoopChildArmText } from '../plan/loop-child-arm.ts'
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
   * into the qsa() / $t() / insert() call shapes.
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
  /** Same as `elementIndexBySlot`, for text-marker slots (`$t`). */
  textIndexBySlot?: ReadonlyMap<string, number>
}

export function stringifyReactiveEffects(
  lines: string[],
  plan: ReactiveEffectsPlan,
  opts: StringifyReactiveEffectsOptions,
): void {
  const { indent, elVar, bodyIsMultiRoot, elementIndexBySlot, textIndexBySlot } = opts
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

  // 2. Outer text effects (slots NOT inside any conditional branch).
  for (const text of plan.outerTexts) {
    emitOuterText(lines, indent, elVar, text, bindingBfId(text.slotId), textIndexBySlot?.get(text.slotId))
  }

  // 3. Reactive conditionals — each emits an insert(...) over `elVar` whose
  //    arm bodies dispatch through the per-arm stringifiers.
  for (const cond of plan.conditionals) {
    emitOuterConditional(lines, indent, elVar, cond, pc)
  }
}

function emitOuterText(
  lines: string[],
  indent: string,
  elVar: string,
  text: ReactiveTextEffect,
  bfId: string = '',
  pIdx?: number,
): void {
  const varName = `__rt_${varSlotId(text.slotId)}`
  if (pIdx !== undefined) {
    // Direct-path resolution (#2143): `__p` holds the marker Comment node;
    // `tAfter` mirrors `$t`'s create-if-absent Text-node semantics exactly.
    lines.push(`${indent}{ const ${varName} = __p ? tAfter(__p[${pIdx}]) : $t(${elVar}, '${text.slotId}')[0]`)
  } else {
    lines.push(`${indent}{ const [${varName}] = $t(${elVar}, '${text.slotId}')`)
  }
  lines.push(`${indent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${text.wrappedExpression}) }${bfId}) }`)
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
  emitArmBody(lines, cond.whenTrueArm, armIndent, pc)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}, {`)
  lines.push(`${indent}  template: () => { const __slots = []; return { html: \`${cond.whenFalseTemplateHtml}\`, slots: __slots } },`)
  lines.push(`${indent}  bindEvents: (__branchScope, { isFirstRun: __bfFirstRun = false } = {}) => {`)
  emitArmBody(lines, cond.whenFalseArm, armIndent, pc)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}${profileBindingId(pc, cond.slotId)})`)
}

function emitArmBody(lines: string[], arm: LoopChildArmPlan, armIndent: string, pc: string | undefined): void {
  stringifyBranchEventBindings(lines, arm.events, armIndent)
  stringifyBranchChildComponentInits(lines, arm.childComponents, armIndent)
  stringifyBranchInnerLoops(lines, arm.innerLoops, armIndent, pc)
  stringifyLoopChildConditionals(lines, arm.nestedConditionals, armIndent, pc)
  stringifyBranchReactiveAttrs(lines, arm.attrs, armIndent, pc)
  for (const text of arm.texts) {
    emitArmText(lines, armIndent, text, pc)
  }
}

function emitArmText(lines: string[], indent: string, text: LoopChildArmText, pc: string | undefined): void {
  // __bfText (not a naive `.textContent = String(...)`) so a Child-position
  // expression whose value is a live Node (e.g. a hoisted `renderNode={(n)
  // => <PillNode/>}` callback, #1213) is spliced into the slot by identity
  // instead of being stringified to "[object HTMLElement]" (#2347).
  const varName = `__rt_${varSlotId(text.slotId)}`
  lines.push(`${indent}let ${varName} = $t(__branchScope, '${text.slotId}')[0]`)
  lines.push(`${indent}createEffect(() => { ${varName} = __bfText(${varName}, ${text.wrappedExpression}) }${profileBindingId(pc, text.slotId)})`)
}
