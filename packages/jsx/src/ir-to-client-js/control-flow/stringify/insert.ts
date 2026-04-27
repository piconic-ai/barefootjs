/**
 * Stringify an `InsertPlan` to source lines.
 *
 * Output shape (must stay byte-identical to the legacy emitter):
 *
 *     <leadingIndent>insert(<scopeVar>, '<slotId>', () => <cond>, {
 *     <leadingIndent>  template: () => `<true html>`,
 *     <leadingIndent>  bindEvents: (__branchScope) => {
 *                <arm body lines, each prefixed with bodyIndent>
 *     <leadingIndent>  }
 *     <leadingIndent>}, {
 *     <leadingIndent>  template: () => `<false html>`,
 *     <leadingIndent>  bindEvents: (__branchScope) => {
 *                <arm body lines>
 *     <leadingIndent>  }
 *     <leadingIndent>})
 *
 * Indent convention (preserved from the legacy emitter, byte-identical):
 *   - top-level insert call:        `  ` (2 spaces)
 *   - top-level arm marker line:    `    ` (4 spaces) — `template:`, `bindEvents:`
 *   - top-level body content:       `      ` (6 spaces) — events, ref, child comp
 *   - nested insert call:           `      ` (6 spaces) — same as body indent
 *   - nested arm marker line:       `        ` (8 spaces)
 *   - nested body content:          `      ` (6 spaces) — bug-for-bug compat (#?)
 *
 * The "body content stays at 6 spaces regardless of depth" quirk is a known
 * legacy oddity (see `emitBranchBindings` hard-coded indents). PR 1 must
 * preserve it; a follow-up PR can fix it now that the indent is data-driven.
 */

import { varSlotId } from '../../utils'
import { emitAttrUpdate } from '../../emit-reactive'
import type { InsertPlan, InsertArm, ArmBody, ScopeRef } from '../plan/types'
import { stringifyBranchLoops } from './branch-loop'
import { emitListenerLine } from './event-listener'

export interface StringifyInsertOptions {
  /** Indent on the `insert(` line itself. */
  leadingIndent: string
  /** Indent for the arm-body content (lines emitted inside bindEvents). */
  bodyIndent: string
}

export function stringifyInsert(
  lines: string[],
  plan: InsertPlan,
  opts: StringifyInsertOptions,
): void {
  const { leadingIndent, bodyIndent } = opts
  const scopeVar = scopeRefToVar(plan.scope)
  const armIndent = leadingIndent + '  '

  lines.push(`${leadingIndent}insert(${scopeVar}, '${plan.slotId}', () => ${plan.condition}, {`)
  emitArm(lines, plan.arms[0], plan.eventNameMode, armIndent, bodyIndent)
  lines.push(`${leadingIndent}}, {`)
  emitArm(lines, plan.arms[1], plan.eventNameMode, armIndent, bodyIndent)
  lines.push(`${leadingIndent}})`)
}

function emitArm(
  lines: string[],
  arm: InsertArm,
  mode: 'dom' | 'raw',
  armIndent: string,
  bodyIndent: string,
): void {
  lines.push(`${armIndent}template: () => \`${arm.templateHtml}\`,`)
  lines.push(`${armIndent}bindEvents: (__branchScope) => {`)
  emitArmBody(lines, arm.body, mode, bodyIndent)
  lines.push(`${armIndent}}`)
}

function emitArmBody(
  lines: string[],
  body: ArmBody,
  mode: 'dom' | 'raw',
  indent: string,
): void {
  // 1. Combine event-bearing slots and ref slots into a single `$()` query.
  //    Order: events-first, then refs (matches legacy emitter).
  const allSlotIds = new Set<string>()
  for (const ev of body.events) allSlotIds.add(ev.slotId)
  for (const ref of body.refs) allSlotIds.add(ref.slotId)

  if (allSlotIds.size > 0) {
    const slotArr = [...allSlotIds]
    const vars = slotArr.map(id => `_${varSlotId(id)}`).join(', ')
    const args = slotArr.map(id => `'${id}'`).join(', ')
    lines.push(`${indent}const [${vars}] = $(__branchScope, ${args})`)
  }

  // 2. Group events by slot — preserves legacy emit order (events-by-slot
  //    in declaration order) without changing the underlying contract.
  const eventsBySlot = new Map<string, typeof body.events>()
  for (const ev of body.events) {
    if (!eventsBySlot.has(ev.slotId)) eventsBySlot.set(ev.slotId, [])
    eventsBySlot.get(ev.slotId)!.push(ev)
  }
  for (const [slotId, slotEvents] of eventsBySlot) {
    const v = varSlotId(slotId)
    for (const ev of slotEvents) {
      emitListenerLine(lines, indent, `_${v}`, ev.eventName, ev.handler, mode)
    }
  }

  for (const ref of body.refs) {
    const v = varSlotId(ref.slotId)
    lines.push(`${indent}if (_${v}) (${ref.callback})(_${v})`)
  }

  // 3. Child component initializations from the branch swap.
  for (let i = 0; i < body.childComponents.length; i++) {
    const comp = body.childComponents[i]
    const varName = `__c${i}`
    const selectorArg = comp.slotId || comp.name
    lines.push(`${indent}const [${varName}] = $c(__branchScope, '${selectorArg}')`)
    lines.push(`${indent}if (${varName}) initChild('${comp.name}', ${varName}, ${comp.propsExpr})`)
  }

  // 4. Disposable section: reactive attrs + text effects + branch loops + nested conditionals.
  //    Emitted inside the same `__disposers = []` / `return () => ...` envelope
  //    so the legacy single-disposers-array shape is preserved (PR 1).
  const hasDisposables =
    body.reactiveAttrs.length > 0 ||
    body.textEffects.length > 0 ||
    body.loops.length > 0 ||
    body.conditionals.length > 0
  if (!hasDisposables) return

  lines.push(`${indent}const __disposers = []`)

  // Reactive attribute bindings inside the branch (#1071). Each effect
  // resolves its target via `qsa(__branchScope, ...)` so a fresh DOM swap
  // produces a fresh element reference; without this, the effect would
  // keep writing to a stale, detached node placed there at first hydration.
  // Group by slot so each `qsa` call covers all attrs on the same element,
  // mirroring the init-level `attrsBySlot` shape in `emit-reactive.ts`.
  const attrsBySlot = new Map<string, typeof body.reactiveAttrs>()
  for (const attr of body.reactiveAttrs) {
    if (!attrsBySlot.has(attr.slotId)) attrsBySlot.set(attr.slotId, [])
    attrsBySlot.get(attr.slotId)!.push(attr)
  }
  for (const [slotId, attrs] of attrsBySlot) {
    const v = varSlotId(slotId)
    const elVar = `__ra_${v}`
    lines.push(`${indent}{ const ${elVar} = qsa(__branchScope, '[bf="${slotId}"]')`)
    lines.push(`${indent}if (${elVar}) {`)
    for (const attr of attrs) {
      lines.push(`${indent}  __disposers.push(createDisposableEffect(() => {`)
      for (const stmt of emitAttrUpdate(elVar, attr.attrName, attr.expression, attr)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  }))`)
    }
    lines.push(`${indent}} }`)
  }

  for (const te of body.textEffects) {
    const v = varSlotId(te.slotId)
    lines.push(`${indent}const [__el_${v}] = $t(__branchScope, '${te.slotId}')`)
    lines.push(`${indent}__disposers.push(createDisposableEffect(() => {`)
    lines.push(`${indent}  const __val = ${te.expression}`)
    lines.push(`${indent}  if (__el_${v} && !__val?.__isSlot) __el_${v}.nodeValue = String(__val ?? '')`)
    lines.push(`${indent}}))`)
  }

  // Branch loops, now fully Plan-built. The stringifier writes its own
  // `      ` (6 spaces) indent for byte-identical parity with the legacy
  // emitter; nested inserts call back into the same shape.
  if (body.loops.length > 0) {
    stringifyBranchLoops(lines, body.loops)
  }

  // Nested conditionals: wrap in a disposable effect so the inner
  // `insert()` (and its child createEffects, mapArrays, …) is registered
  // as a child of this owner — branch swap then dispose()s the entry,
  // releasing the inner effect tree. Without the wrap the inner effects
  // leak (observation O-2): hidden nested conditionals keep re-evaluating
  // their condition signal, and any inner mapArray they own keeps
  // re-rendering on signal change.
  //
  // leadingIndent = current bodyIndent + 2 (inside the disposable arrow);
  // bodyIndent stays the SAME (6 spaces inside the inner insert) for
  // compat with the legacy emitter's hard-coded indent.
  for (const cond of body.conditionals) {
    lines.push(`${indent}__disposers.push(createDisposableEffect(() => {`)
    stringifyInsert(lines, cond, {
      leadingIndent: indent + '  ',
      bodyIndent: indent,
    })
    lines.push(`${indent}}))`)
  }

  lines.push(`${indent}return () => __disposers.forEach(d => d())`)
}

function scopeRefToVar(ref: ScopeRef): string {
  switch (ref.kind) {
    case 'top': return '__scope'
    case 'branchScope': return '__branchScope'
    case 'var': return ref.name
  }
}
