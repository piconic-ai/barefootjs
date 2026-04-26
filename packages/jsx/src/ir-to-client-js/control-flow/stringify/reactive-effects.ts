/**
 * Stringify a `ReactiveEffectsPlan` into source lines.
 *
 * The stringifier is a deterministic walk: every wrap and every partition
 * decision was already made by `buildReactiveEffectsPlan`. Conditional arm
 * bodies (events, child component inits, inner loops, nested conditionals,
 * branch-scoped texts) flow through the per-arm stringifiers in
 * `loop-child-arm.ts` — no legacy passthrough remains.
 */

import { varSlotId } from '../../utils'
import { emitAttrUpdate } from '../../emit-reactive'
import {
  stringifyBranchChildComponentInits,
  stringifyBranchEventBindings,
  stringifyBranchInnerLoops,
  stringifyLoopChildConditionals,
} from './loop-child-arm'
import type { LoopChildArmPlan, LoopChildArmText } from '../plan/loop-child-arm'
import type {
  NestedConditionalPlan,
  ReactiveEffectsPlan,
  ReactiveTextEffect,
} from '../plan/reactive-effects'

export interface StringifyReactiveEffectsOptions {
  /** Indent prefix for every emitted line. */
  indent: string
  /**
   * Element variable to attach effects to (e.g., `__el`, `__existing`,
   * `__csrEl`). The stringifier never inspects it — it is simply substituted
   * into the qsa() / $t() / insert() call shapes.
   */
  elVar: string
}

export function stringifyReactiveEffects(
  lines: string[],
  plan: ReactiveEffectsPlan,
  opts: StringifyReactiveEffectsOptions,
): void {
  const { indent, elVar } = opts

  // 1. Reactive attribute effects (one qsa per slot, then per-attr createEffect).
  for (const slot of plan.attrSlots) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    lines.push(`${indent}{ const ${varName} = qsa(${elVar}, '[bf="${slot.slotId}"]')`)
    lines.push(`${indent}if (${varName}) {`)
    for (const attr of slot.attrs) {
      lines.push(`${indent}  createEffect(() => {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.wrappedExpression, attr.meta)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  })`)
    }
    lines.push(`${indent}} }`)
  }

  // 2. Outer text effects (slots NOT inside any conditional branch).
  for (const text of plan.outerTexts) {
    emitOuterText(lines, indent, elVar, text)
  }

  // 3. Reactive conditionals — each emits an insert(...) over `elVar` whose
  //    arm bodies dispatch through the per-arm stringifiers.
  for (const cond of plan.conditionals) {
    emitOuterConditional(lines, indent, elVar, cond)
  }
}

function emitOuterText(
  lines: string[],
  indent: string,
  elVar: string,
  text: ReactiveTextEffect,
): void {
  const varName = `__rt_${varSlotId(text.slotId)}`
  lines.push(`${indent}{ const [${varName}] = $t(${elVar}, '${text.slotId}')`)
  lines.push(`${indent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${text.wrappedExpression}) }) }`)
}

function emitOuterConditional(
  lines: string[],
  indent: string,
  elVar: string,
  cond: NestedConditionalPlan,
): void {
  const armIndent = `${indent}    `

  lines.push(`${indent}insert(${elVar}, '${cond.slotId}', () => ${cond.wrappedCondition}, {`)
  lines.push(`${indent}  template: () => \`${cond.whenTrueTemplateHtml}\`,`)
  lines.push(`${indent}  bindEvents: (__branchScope) => {`)
  emitArmBody(lines, cond.whenTrueArm, armIndent)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}, {`)
  lines.push(`${indent}  template: () => \`${cond.whenFalseTemplateHtml}\`,`)
  lines.push(`${indent}  bindEvents: (__branchScope) => {`)
  emitArmBody(lines, cond.whenFalseArm, armIndent)
  lines.push(`${indent}  }`)
  lines.push(`${indent}})`)
}

function emitArmBody(lines: string[], arm: LoopChildArmPlan, armIndent: string): void {
  stringifyBranchEventBindings(lines, arm.events, armIndent)
  stringifyBranchChildComponentInits(lines, arm.childComponents, armIndent)
  stringifyBranchInnerLoops(lines, arm.innerLoops, armIndent)
  stringifyLoopChildConditionals(lines, arm.nestedConditionals, armIndent)
  for (const text of arm.texts) {
    emitArmText(lines, armIndent, text)
  }
}

function emitArmText(lines: string[], indent: string, text: LoopChildArmText): void {
  const varName = `__rt_${varSlotId(text.slotId)}`
  lines.push(`${indent}{ const [${varName}] = $t(__branchScope, '${text.slotId}')`)
  lines.push(`${indent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${text.wrappedExpression}) }) }`)
}
