/**
 * Stringify a `ReactiveEffectsPlan` into source lines.
 *
 * The stringifier is a deterministic walk: every wrap and every partition
 * decision was already made by `buildReactiveEffectsPlan`. Conditional arm
 * bodies (events, child component inits, inner loops, nested conditionals,
 * branch-scoped texts) flow through the per-arm stringifiers in
 * `loop-child-arm.ts` — no legacy passthrough remains.
 *
 * Row-granularity effects (perf, spec/slot-unification.md §3(c)/§8, the
 * deferred A3b): for the "plain loop row, top-level or branch-scoped" shape
 * — the only shape where `stringifyReactiveEffects` is called alongside
 * `PreambleRegionPlan`s from the SAME renderItem scope (`stringify/loop.ts`'s
 * `stringifyPlainLoop`, `stringify/branch-loop.ts`'s `emitPlain`) — reactive
 * attrs, outer texts, and preamble regions all read the SAME per-item signal
 * dependency, so consolidating them into ONE `createEffect` per row removes
 * N-1 effect objects and subscription-list entries per row without changing
 * the firing profile. Composite loops, component loops, and the anchored
 * (whole-item-conditional) loop shape keep the legacy one-effect-per-slot
 * emission — their reactiveEffects never carry preamble regions, and
 * consolidating them wasn't part of this pass's mechanically-verified scope
 * (see the call sites' docstrings).
 *
 * Profile mode (#1690) carries a `<Component>#binding:<slotId>` id per
 * effect so the profiler attributes a re-run to its source binding — merging
 * bindings into one effect would make every binding on the row share one id.
 * Resolution: profile mode (`plan.profileComponentName` set) keeps the
 * granular per-slot/per-attr effect emission (`emitAttrSlotsGranular` /
 * `emitOuterTexts` below); normal builds get the consolidated row effect.
 * Preamble regions never carried a per-region bfId even before this pass, so
 * they always consolidate into one effect regardless of profile mode.
 */

import { varSlotId, profileBindingId } from '../../utils.ts'
import { emitAttrUpdate } from '../../emit-reactive.ts'
import { stringifyLoopChildArm } from './loop-child-arm.ts'
import { claimPlanLiteral, claimWriterVarName, type ClaimSlotSpec } from './claim-plan.ts'
import type {
  NestedConditionalPlan,
  ReactiveAttrSlot,
  ReactiveEffectsPlan,
  ReactiveTextEffect,
} from '../plan/reactive-effects.ts'

/** A resolved preamble-patched region (#2389) ready to merge into the row
 *  effect — same shape as `plan/loop.ts`'s `PreambleRegionPlan`, restated
 *  here so this module doesn't need a cross-import into the loop plan file
 *  for one two-field shape. */
export interface RowPreambleRegion {
  slotId: string
  valueExpr: string
}

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
  /**
   * Preamble-patched regions (#2389) to merge into the SAME row effect as
   * this scope's reactive attrs/outer texts (row-granularity effects,
   * §3(c)) — only supplied by the plain-loop-row call sites
   * (`stringify/loop.ts`, `stringify/branch-loop.ts`) where
   * `PlainLoopVariant.preambleRegions` exists on the plan. Every other
   * caller omits this and gets the legacy per-slot emission untouched.
   */
  preambleRegions?: readonly RowPreambleRegion[]
  /**
   * The loop callback's pre-return preamble (already wrapped with the loop
   * param accessor), re-run once per row-effect tick — BEFORE any preamble
   * region read — so `preambleRegions`' `valueExpr`s see freshly recomputed
   * locals. Only meaningful alongside `preambleRegions`.
   */
  mapPreambleWrapped?: string
}

export function stringifyReactiveEffects(
  lines: string[],
  plan: ReactiveEffectsPlan | null,
  opts: StringifyReactiveEffectsOptions,
): void {
  const { indent, elVar, bodyIsMultiRoot, elementIndexBySlot, textClaimPathExprs, preambleRegions = [], mapPreambleWrapped } = opts
  const lookup = bodyIsMultiRoot ? 'qsaItem' : 'qsa'
  const pc = plan?.profileComponentName
  const bindingBfId = (slotId: string): string => profileBindingId(pc, slotId)
  const attrSlots = plan?.attrSlots ?? []
  const outerTexts = plan?.outerTexts ?? []
  const conditionals = plan?.conditionals ?? []

  if (pc) {
    // Profile mode: preserve the granular per-slot/per-attr effect shape so
    // every binding keeps its own bfId (see module docstring).
    emitAttrSlotsGranular(lines, indent, elVar, lookup, attrSlots, elementIndexBySlot, bindingBfId, mapPreambleWrapped)
    emitOuterTexts(lines, indent, elVar, outerTexts, bindingBfId, textClaimPathExprs)
    emitPreambleRegionsEffect(lines, indent, elVar, preambleRegions, mapPreambleWrapped)
  } else {
    emitConsolidatedRowEffect(
      lines, indent, elVar, lookup,
      attrSlots, outerTexts, elementIndexBySlot, textClaimPathExprs,
      preambleRegions, mapPreambleWrapped,
    )
  }

  // Reactive conditionals — each emits an insert(...) over `elVar` whose arm
  // bodies dispatch through the per-arm stringifiers. Structurally distinct
  // from the attrs/texts/regions merge above (its own per-branch disposable
  // effects), so it's untouched by row-granularity consolidation.
  for (const cond of conditionals) {
    emitOuterConditional(lines, indent, elVar, cond, pc)
  }
}

// --- profile-mode / legacy granular emission (one createEffect per slot-attr) ---

function emitAttrSlotsGranular(
  lines: string[],
  indent: string,
  elVar: string,
  lookup: string,
  attrSlots: readonly ReactiveAttrSlot[],
  elementIndexBySlot: ReadonlyMap<string, number> | undefined,
  bindingBfId: (slotId: string) => string,
  mapPreambleWrapped: string | undefined,
): void {
  for (const slot of attrSlots) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    const lookupExpr = attrLookupExpr(slot.slotId, varName, elVar, lookup, elementIndexBySlot)
    lines.push(`${indent}{ const ${varName} = ${lookupExpr}`)
    lines.push(`${indent}if (${varName}) {`)
    for (const attr of slot.attrs) {
      lines.push(`${indent}  createEffect(() => {`)
      // Profile mode keeps one effect per attr, so an attr reading a preamble
      // local needs the declarations inside ITS OWN effect — there is no
      // shared row-effect scope to hoist them into here (#2447 follow-up).
      // Re-running per attr is the price of the per-binding bfId this mode
      // exists to produce; `bf debug profile` is off the build hot path.
      if (attr.readsPreamble && mapPreambleWrapped) {
        lines.push(`${indent}    ${mapPreambleWrapped}`)
      }
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.wrappedExpression, attr.meta)) {
        lines.push(`${indent}    ${stmt}`)
      }
      lines.push(`${indent}  }${bindingBfId(slot.slotId)})`)
    }
    lines.push(`${indent}} }`)
  }
}

/** ONE createEffect covering every preamble region — never carried a bfId
 *  before this pass (regions were never profiled per-binding), so this
 *  shape applies in both profile and non-profile mode. */
function emitPreambleRegionsEffect(
  lines: string[],
  indent: string,
  elVar: string,
  preambleRegions: readonly RowPreambleRegion[],
  mapPreambleWrapped: string | undefined,
): void {
  if (preambleRegions.length === 0) return
  const slots: ClaimSlotSpec[] = preambleRegions.map(r => ({ id: r.slotId, kind: 'markup', path: [] }))
  const writer = claimWriterVarName(slots, varSlotId)
  lines.push(`${indent}const ${writer} = lazySlots(${elVar}, ${claimPlanLiteral(slots)})`)
  lines.push(`${indent}createEffect(() => {`)
  if (mapPreambleWrapped) lines.push(`${indent}  ${mapPreambleWrapped}`)
  for (const region of preambleRegions) {
    lines.push(`${indent}  ${writer}('${region.slotId}', ${region.valueExpr})`)
  }
  lines.push(`${indent}})`)
}

/** Does any attr in these slots read a `.map()` preamble local (#2447)? */
function attrsReadPreamble(attrSlots: readonly ReactiveAttrSlot[]): boolean {
  return attrSlots.some(slot => slot.attrs.some(a => a.readsPreamble))
}

function attrLookupExpr(
  slotId: string,
  varName: string,
  elVar: string,
  lookup: string,
  elementIndexBySlot: ReadonlyMap<string, number> | undefined,
): string {
  const pIdx = elementIndexBySlot?.get(slotId)
  return pIdx !== undefined
    ? `__p ? __p[${pIdx}] : ${lookup}(${elVar}, '[bf="${slotId}"]')`
    : `${lookup}(${elVar}, '[bf="${slotId}"]')`
}

// --- row-granularity consolidated emission (ONE createEffect per row) ---

/**
 * Emit ONE `createEffect` covering: reactive attr writes (for every slot in
 * `attrSlots`), outer text writes, and preamble-region writes — in that
 * order, mirroring the legacy relative ordering (attrs, then texts, then
 * regions). Attr-slot element lookups are resolved ONCE, outside the
 * effect (identical to the legacy shape — only the WRITE moves inside the
 * shared effect). Outer texts and preamble regions share ONE claimed-slot
 * writer (mixed 'text'/'markup' kinds — `claim-slots.ts`'s `write()` already
 * dispatches per-slot on `kind`), so a row pays for at most one `lazySlots`
 * closure + one claim `Map` instead of one per category.
 *
 * Every attr's write statements are wrapped in their own `{ }` block (not
 * just each slot's) — `emitAttrUpdate`'s 'value'-attr shape emits a bare
 * `const __val = …` with no block of its own, and merging multiple attrs
 * into one function body (previously each had its own arrow-function scope)
 * would let two 'value' attrs in the same row effect collide on `__val`.
 */
function emitConsolidatedRowEffect(
  lines: string[],
  indent: string,
  elVar: string,
  lookup: string,
  attrSlots: readonly ReactiveAttrSlot[],
  outerTexts: readonly ReactiveTextEffect[],
  elementIndexBySlot: ReadonlyMap<string, number> | undefined,
  textClaimPathExprs: ReadonlyMap<string, string> | undefined,
  preambleRegions: readonly RowPreambleRegion[],
  mapPreambleWrapped: string | undefined,
): void {
  if (attrSlots.length === 0 && outerTexts.length === 0 && preambleRegions.length === 0) return

  // 1. Resolve every attr slot's element reference once, outside the effect.
  for (const slot of attrSlots) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    lines.push(`${indent}const ${varName} = ${attrLookupExpr(slot.slotId, varName, elVar, lookup, elementIndexBySlot)}`)
  }

  // 2. ONE claimed-slot writer covering outer texts (kind 'text') and
  //    preamble regions (kind 'markup') — mixed-kind plans are supported by
  //    claim-slots.ts's per-slot `kind` dispatch.
  const claimSlots: ClaimSlotSpec[] = [
    ...outerTexts.map((t): ClaimSlotSpec => ({ id: t.slotId, kind: 'text', path: [], pathExpr: textClaimPathExprs?.get(t.slotId) })),
    ...preambleRegions.map((r): ClaimSlotSpec => ({ id: r.slotId, kind: 'markup', path: [] })),
  ]
  const writer = claimSlots.length > 0 ? claimWriterVarName(claimSlots, varSlotId) : null
  if (writer) {
    lines.push(`${indent}const ${writer} = lazySlots(${elVar}, ${claimPlanLiteral(claimSlots)})`)
  }

  // 3. The single row effect: attr writes, then (if any region needs it) the
  //    preamble re-run, then text writes, then region writes. The by-far
  //    most common shape — no attrs, no regions, exactly one outer text —
  //    collapses to the SAME single-line `createEffect(() => { ... })` the
  //    legacy per-text emitter used (doc-examples snapshots pin this byte
  //    shape); anything busier (an attr present, multiple slots, or a
  //    preamble region) uses the multi-line block.
  if (attrSlots.length === 0 && preambleRegions.length === 0 && outerTexts.length === 1) {
    const text = outerTexts[0]
    lines.push(`${indent}createEffect(() => { ${writer}('${text.slotId}', String(${text.wrappedExpression})) })`)
    return
  }
  lines.push(`${indent}createEffect(() => {`)
  // The preamble re-run leads the body, not trails it (#2447 follow-up).
  // It used to sit between the attr writes and the region writes, because
  // regions were its only readers. An attribute can read a preamble local
  // now (`class={cls}`), and it reads it from THIS scope — so the
  // declarations have to exist before the first write, whichever kind that
  // is. Regions are unaffected by the move: they were already downstream.
  if (mapPreambleWrapped && (preambleRegions.length > 0 || attrsReadPreamble(attrSlots))) {
    lines.push(`${indent}  ${mapPreambleWrapped}`)
  }
  for (const slot of attrSlots) {
    const varName = `__ra_${varSlotId(slot.slotId)}`
    lines.push(`${indent}  if (${varName}) {`)
    for (const attr of slot.attrs) {
      lines.push(`${indent}    {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.wrappedExpression, attr.meta)) {
        lines.push(`${indent}      ${stmt}`)
      }
      lines.push(`${indent}    }`)
    }
    lines.push(`${indent}  }`)
  }
  for (const text of outerTexts) {
    lines.push(`${indent}  ${writer}('${text.slotId}', String(${text.wrappedExpression}))`)
  }
  for (const region of preambleRegions) {
    lines.push(`${indent}  ${writer}('${region.slotId}', ${region.valueExpr})`)
  }
  lines.push(`${indent}})`)
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
