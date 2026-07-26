/**
 * Stringifiers for the per-arm Plans defined in `plan/loop-child-arm.ts`.
 *
 * Item 2 of `tmp/emit-survey/HANDOFF.md` migrates the recursive
 * branch ↔ loop ↔ conditional helpers from `shared.ts` into Plan +
 * stringify pairs. This file grows one stringifier at a time as each helper
 * is migrated.
 *
 * Output shapes are preserved byte-for-byte against the corresponding legacy
 * helper. Indent is taken as a parameter so the same stringifier works at
 * every nesting depth.
 */

import { varSlotId, DATA_BF_PH, keyAttrName, profileBindingId } from '../../utils.ts'
import { emitComponentAndEventSetup } from '../shared.ts'
import { emitAttrUpdate } from '../../emit-reactive.ts'
import { templateRootIsSvg } from './template-parse.ts'
import { emitListenerLine } from './event-listener.ts'
import { nameForRegistryRef } from '../../component-scope.ts'
import { claimPlanLiteral, claimWriterVarName, type ClaimSlotSpec } from './claim-plan.ts'
import type {
  BranchChildComponentInitsPlan,
  BranchEventBindingsPlan,
  BranchInnerLoopsPlan,
  LoopChildArmPlan,
  LoopChildConditionalPlan,
} from '../plan/loop-child-arm.ts'
import type { ReactiveAttrSlot } from '../plan/reactive-effects.ts'

/**
 * Emit reactive attribute effects for one arm — one qsa() per slot, then one
 * `createDisposableEffect` per attr on that slot, pushed onto the caller's
 * `__disposers` array. Mirrors the outer renderItem-scope attr emission in
 * `stringifyReactiveEffects` (#2347): binding attrs inside the arm that owns
 * the element (instead of an outer scope's own initial clone) means a branch
 * swap's fresh `insert()`-mounted node is always the one the effect targets.
 *
 * `createDisposableEffect` (not `createEffect`) so the caller's `bindEvents`
 * can return a cleanup that disposes this effect on the NEXT branch swap —
 * otherwise it would keep running against the node this branch swap just
 * detached, and every subsequent swap stacks another orphaned effect.
 * Callers must declare `const __disposers = []` before emitting this and
 * return `() => __disposers.forEach(d => d())` from `bindEvents`.
 */
export function stringifyBranchReactiveAttrs(
  lines: string[],
  plan: readonly ReactiveAttrSlot[],
  indent: string,
  pc?: string,
): void {
  for (const slot of plan) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    lines.push(`${indent}{ const ${varName} = qsa(__branchScope, '[bf="${slot.slotId}"]')`)
    lines.push(`${indent}if (${varName}) {`)
    for (const attr of slot.attrs) {
      lines.push(`${indent}  __disposers.push(createDisposableEffect(() => {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.wrappedExpression, attr.meta)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  }${profileBindingId(pc, slot.slotId)}))`)
    }
    lines.push(`${indent}} }`)
  }
}

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
      emitListenerLine(lines, `${indent}  `, `_${v}`, ev.eventName, ev.wrappedHandler, 'dom', ev.turnId)
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
    lines.push(`${indent}{ let __c = qsa(__branchScope, ${init.selector}); if (!__c) { const __ph = __branchScope.querySelector('[${DATA_BF_PH}="${init.placeholderId}"]'); if (__ph) { __c = createComponent('${nameForRegistryRef(init.name)}', ${init.propsExpr}); __ph.replaceWith(__c) } } if (__c) initChild('${nameForRegistryRef(init.name)}', __c, ${init.propsExpr}) }`)
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
  pc?: string,
): void {
  for (const inner of plan) {
    const uid = inner.uidSuffix
    lines.push(`${indent}{ const __bic${uid} = ${inner.containerExpr}`)
    lines.push(`${indent}if (__bic${uid}) mapArray(() => ${inner.arrayExpr} || [], __bic${uid}, ${inner.keyFn}, (${inner.paramHead}, __bidx${uid}, __existing) => {`)
    // Index alias (#2218) lands first — before the destructure unwrap and
    // the template clone, either of which may reference the index.
    if (inner.indexAlias) {
      lines.push(`${indent}  ${inner.indexAlias}`)
    }
    if (inner.paramUnwrap) {
      lines.push(`${indent}  ${inner.paramUnwrap}`)
    }
    {
      const isSvg = templateRootIsSvg(inner.wrappedTemplate)
      const innerHtml = isSvg ? `<svg>${inner.wrappedTemplate}</svg>` : inner.wrappedTemplate
      const childPath = isSvg ? '.firstElementChild.firstElementChild' : '.firstElementChild'
      lines.push(`${indent}  let __bel${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${innerHtml}\`; return __t.content${childPath}.cloneNode(true) })()`)
    }
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
    const conditionalTexts = inner.reactiveTexts.filter(t => t.insideConditional)
    const plainTexts = inner.reactiveTexts.filter(t => !t.insideConditional)
    for (const text of conditionalTexts) {
      const bf = profileBindingId(pc, text.slotId)
      // Fresh `claimSlots` claim every run (not the cached `lazySlots` door):
      // insert() may swap the branch's DOM between runs, and a 'text' write
      // is a plain, idempotent `nodeValue` assignment with no dedup state to
      // go stale — replaces the old re-query-$t-on-every-run discipline.
      lines.push(`${indent}  createEffect(() => { claimSlots(__bel${uid}, [{ id: '${text.slotId}', kind: 'text', path: [] }]).write('${text.slotId}', String(${text.wrappedExpression})) }${bf})`)
    }
    if (plainTexts.length > 0) {
      const slots: ClaimSlotSpec[] = plainTexts.map(t => ({ id: t.slotId, kind: 'text', path: [] }))
      const writer = claimWriterVarName(slots, varSlotId)
      lines.push(`${indent}  const ${writer} = lazySlots(__bel${uid}, ${claimPlanLiteral(slots)})`)
      for (const text of plainTexts) {
        lines.push(`${indent}  createEffect(() => { ${writer}('${text.slotId}', String(${text.wrappedExpression})) }${profileBindingId(pc, text.slotId)})`)
      }
    }
    if (inner.nestedConditionals.length > 0) {
      stringifyLoopChildConditionals(lines, inner.nestedConditionals, `${indent}  `, pc)
    }
    lines.push(`${indent}  return __bel${uid}`)
    lines.push(`${indent}}, '${inner.markerId}'${profileBindingId(pc, inner.slotId)}) }`)
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
  pc?: string,
): void {
  for (const cond of conditionals) {
    stringifyLoopChildConditional(lines, cond, indent, pc)
  }
}

function stringifyLoopChildConditional(
  lines: string[],
  cond: LoopChildConditionalPlan,
  indent: string,
  pc: string | undefined,
): void {
  const armIndent = `${indent}    `
  // Body-form arrows wire `__bfSlot` captures into the runtime so live
  // `Node` returns from Child-position interpolations are spliced into
  // the parsed fragment instead of being stringified by the surrounding
  // template literal (#1213).
  lines.push(`${indent}insert(${cond.scopeVar}, '${cond.slotId}', () => ${cond.wrappedCondition}, {`)
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

/**
 * Emit one arm's full body: events, child component inits, inner loops,
 * then a disposable section (reactive attrs, nested conditionals, texts)
 * whose aggregate cleanup `bindEvents` returns to `insert()` (#2347 follow-up).
 * Shared by both the loop-scoped-conditional stringifier in this file and
 * the outer (top-of-loop-item) conditional stringifier in
 * `reactive-effects.ts` — the two arm shapes are identical.
 */
export function stringifyLoopChildArm(
  lines: string[],
  arm: LoopChildArmPlan,
  armIndent: string,
  pc: string | undefined,
): void {
  stringifyBranchEventBindings(lines, arm.events, armIndent)
  stringifyBranchChildComponentInits(lines, arm.childComponents, armIndent)
  stringifyBranchInnerLoops(lines, arm.innerLoops, armIndent, pc)

  // Disposable section: reactive attrs + text effects + nested conditionals.
  // `bindEvents` returns the aggregate cleanup so `insert()` disposes this
  // arm's scoped effects (and any nested insert()'s own effect tree) before
  // the NEXT branch swap — otherwise they'd keep running against the node
  // this swap just detached, stacking another orphaned effect on every
  // subsequent toggle (#2347 follow-up).
  const hasDisposables = arm.attrs.length > 0 || arm.texts.length > 0 || arm.nestedConditionals.length > 0
  if (!hasDisposables) return

  lines.push(`${armIndent}const __disposers = []`)
  stringifyBranchReactiveAttrs(lines, arm.attrs, armIndent, pc)

  // Nested conditionals: each inner `insert()` is wrapped in its own
  // disposable effect so disposing THIS entry cascades to whatever
  // reactive state that insert() set up internally (mirrors the top-level
  // conditional's nested-conditional handling in stringify/insert.ts).
  for (const cond of arm.nestedConditionals) {
    lines.push(`${armIndent}__disposers.push(createDisposableEffect(() => {`)
    stringifyLoopChildConditional(lines, cond, `${armIndent}  `, pc)
    lines.push(`${armIndent}}))`)
  }

  if (arm.texts.length > 0) {
    // 'markup' kind (not 'text') because a Child-position expression's value
    // may be a live Node (e.g. a hoisted `renderNode={(n) => <PillNode/>}`
    // callback, #1213) — claim-slots' markup writer splices a Node in by
    // identity instead of stringifying it to "[object HTMLElement]" (#2347),
    // the same contract `__bfText` used to provide. The writer is built
    // fresh HERE, inside this arm's `bindEvents` body, so every branch
    // activation re-claims against that swap's own `__branchScope` DOM
    // (spec/slot-unification.md §5-A3's "branch-internal slots re-claim per
    // branch activation").
    const slots: ClaimSlotSpec[] = arm.texts.map(t => ({ id: t.slotId, kind: 'markup', path: [] }))
    const writer = claimWriterVarName(slots, varSlotId)
    lines.push(`${armIndent}const ${writer} = lazySlots(__branchScope, ${claimPlanLiteral(slots)})`)
    for (const text of arm.texts) {
      lines.push(`${armIndent}__disposers.push(createDisposableEffect(() => { ${writer}('${text.slotId}', ${text.wrappedExpression}) }${profileBindingId(pc, text.slotId)}))`)
    }
  }

  lines.push(`${armIndent}return () => __disposers.forEach(d => d())`)
}
