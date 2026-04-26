/**
 * Stringifiers for the per-arm Plans defined in `plan/loop-child-arm.ts`.
 *
 * Item 2 of `tmp/emit-survey/HANDOFF.md` migrates the recursive
 * branch ↔ loop ↔ conditional helpers from `legacy-helpers.ts` into Plan +
 * stringify pairs. This file grows one stringifier at a time as each helper
 * is migrated.
 *
 * Output shapes are preserved byte-for-byte against the corresponding legacy
 * helper. Indent is taken as a parameter so the same stringifier works at
 * every nesting depth.
 */

import { varSlotId, DATA_BF_PH, keyAttrName } from '../../utils'
import { emitComponentAndEventSetup } from '../legacy-helpers'
import { emitListenerLine } from './event-listener'
import type {
  BranchChildComponentInitsPlan,
  BranchEventBindingsPlan,
  BranchInnerLoopsPlan,
  LoopChildArmPlan,
  LoopChildConditionalPlan,
} from '../plan/loop-child-arm'

/**
 * Emit `addEventListener` setup for a loop-cond branch arm. One qsa() per
 * slot, then one listener line per (slotId, eventName) pair. The closing
 * brace lives on its own line to keep each `emitListenerLine` call uniform —
 * a deliberate departure from the very oldest legacy emitter (which closed
 * the brace inline with the last listener line) but consistent with the
 * post-PR-1045 listener-emission shape.
 */
export function stringifyBranchEventBindings(
  lines: string[],
  plan: BranchEventBindingsPlan,
  indent: string,
): void {
  for (const slot of plan) {
    const v = varSlotId(slot.slotId)
    // qsa() (not $()) because __branchScope is the loop-item element itself
    // and may not carry a bf-s attribute — scope-aware $() would walk to the
    // nearest bf-s and miss descendants in that case.
    lines.push(`${indent}{ const _${v} = qsa(__branchScope, '[bf="${slot.slotId}"]')`)
    for (const ev of slot.listeners) {
      emitListenerLine(lines, `${indent}  `, `_${v}`, ev.eventName, ev.wrappedHandler)
    }
    lines.push(`${indent}}`)
  }
}

/**
 * Emit one initChild + placeholder-replacement line per child component
 * inside an arm body. Mirrors the legacy `emitBranchChildComponentInits`
 * shape verbatim (everything on one line per component).
 *
 * SSR side: element has `bf-s` → qsa() finds it, initChild wires events.
 * CSR side: element is a `data-bf-ph` placeholder → createComponent
 * replaces it, then initChild runs against the new element.
 */
export function stringifyBranchChildComponentInits(
  lines: string[],
  plan: BranchChildComponentInitsPlan,
  indent: string,
): void {
  for (const init of plan) {
    lines.push(`${indent}{ let __c = qsa(__branchScope, '${init.selector}'); if (!__c) { const __ph = __branchScope.querySelector('[${DATA_BF_PH}="${init.placeholderId}"]'); if (__ph) { __c = createComponent('${init.name}', ${init.propsExpr}); __ph.replaceWith(__c) } } if (__c) initChild('${init.name}', __c, ${init.propsExpr}) }`)
  }
}

/**
 * Emit `mapArray(...)` for each inner loop inside a conditional branch's
 * `bindEvents`. The renderItem body components / events / nested
 * conditionals are still routed through the legacy helpers
 * (`emitComponentAndEventSetup` / `emitNestedLoopChildConditionals`) until
 * Items 2d / 2e migrate them.
 */
export function stringifyBranchInnerLoops(
  lines: string[],
  plan: BranchInnerLoopsPlan,
  indent: string,
): void {
  for (const inner of plan) {
    const uid = inner.uidSuffix
    lines.push(`${indent}{ const __bic${uid} = ${inner.containerExpr}`)
    lines.push(`${indent}if (__bic${uid}) mapArray(() => ${inner.arrayExpr} || [], __bic${uid}, ${inner.keyFn}, (${inner.paramHead}, __bidx${uid}, __existing) => {`)
    if (inner.paramUnwrap) {
      lines.push(`${indent}  ${inner.paramUnwrap}`)
    }
    lines.push(`${indent}  let __bel${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${inner.wrappedTemplate}\`; return __t.content.firstElementChild.cloneNode(true) })()`)
    if (inner.wrappedKey) {
      lines.push(`${indent}  __bel${uid}.setAttribute('${keyAttrName(inner.keyDepth)}', String(${inner.wrappedKey}))`)
    }
    if (inner.legacyComponents.length > 0 || inner.legacyEvents.length > 0) {
      // upsertChild resolves SSR vs CSR at runtime — no `if (!__existing)` split needed.
      emitComponentAndEventSetup(
        lines,
        `${indent}  `,
        `__bel${uid}`,
        [...inner.legacyComponents],
        [...inner.legacyEvents],
        inner.outerLoopParam,
        inner.outerLoopParamBindings,
      )
    }
    for (const text of inner.reactiveTexts) {
      if (text.insideConditional) {
        // Re-query $t inside the effect: insert() may swap the text node so a
        // captured reference would silently stop updating.
        lines.push(`${indent}  createEffect(() => { const [__rt] = $t(__bel${uid}, '${text.slotId}'); if (__rt) __rt.textContent = String(${text.wrappedExpression}) })`)
      } else {
        lines.push(`${indent}  { const [__rt] = $t(__bel${uid}, '${text.slotId}')`)
        lines.push(`${indent}  if (__rt) createEffect(() => { __rt.textContent = String(${text.wrappedExpression}) }) }`)
      }
    }
    if (inner.nestedConditionals.length > 0) {
      stringifyLoopChildConditionals(lines, inner.nestedConditionals, `${indent}  `)
    }
    lines.push(`${indent}  return __bel${uid}`)
    lines.push(`${indent}}) }`)
  }
}

/**
 * Emit `insert(...)` for each Plan in `conditionals` at the given indent.
 * The Plan tree captures every nested-conditional / inner-loop concern, so
 * the stringifier never re-enters legacy recursion. Branch-scoped texts
 * (only present at the outer-conditional level) are emitted via
 * `LoopChildArmPlan.texts`.
 */
export function stringifyLoopChildConditionals(
  lines: string[],
  conditionals: readonly LoopChildConditionalPlan[],
  indent: string,
): void {
  for (const cond of conditionals) {
    stringifyLoopChildConditional(lines, cond, indent)
  }
}

function stringifyLoopChildConditional(
  lines: string[],
  cond: LoopChildConditionalPlan,
  indent: string,
): void {
  const armIndent = `${indent}    `
  lines.push(`${indent}insert(${cond.scopeVar}, '${cond.slotId}', () => ${cond.wrappedCondition}, {`)
  lines.push(`${indent}  template: () => \`${cond.whenTrueTemplateHtml}\`,`)
  lines.push(`${indent}  bindEvents: (__branchScope) => {`)
  stringifyLoopChildArm(lines, cond.whenTrueArm, armIndent)
  lines.push(`${indent}  }`)
  lines.push(`${indent}}, {`)
  lines.push(`${indent}  template: () => \`${cond.whenFalseTemplateHtml}\`,`)
  lines.push(`${indent}  bindEvents: (__branchScope) => {`)
  stringifyLoopChildArm(lines, cond.whenFalseArm, armIndent)
  lines.push(`${indent}  }`)
  lines.push(`${indent}})`)
}

function stringifyLoopChildArm(
  lines: string[],
  arm: LoopChildArmPlan,
  armIndent: string,
): void {
  stringifyBranchEventBindings(lines, arm.events, armIndent)
  stringifyBranchChildComponentInits(lines, arm.childComponents, armIndent)
  stringifyBranchInnerLoops(lines, arm.innerLoops, armIndent)
  stringifyLoopChildConditionals(lines, arm.nestedConditionals, armIndent)
  for (const text of arm.texts) {
    const varName = `__rt_${varSlotId(text.slotId)}`
    lines.push(`${armIndent}{ const [${varName}] = $t(__branchScope, '${text.slotId}')`)
    lines.push(`${armIndent}if (${varName}) createEffect(() => { ${varName}.textContent = String(${text.wrappedExpression}) }) }`)
  }
}
