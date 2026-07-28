/**
 * Build the compiler-side `LazyRowPlan` payload (`spec/slot-unification.md`
 * §9, L3) for one plain loop row — or `null` when the row is ineligible and
 * must keep today's eager `mapArray` emission.
 *
 * Everything decided here is BUILD-TIME data: per-binding item/outer
 * classification (`classifyLazyBinding`), ref-array and dedup-slot layout,
 * and the outer-signal prime list. The stringifier
 * (`stringify/lazy-row.ts`) is a deterministic walk over this plan — it
 * makes no classification decision of its own.
 *
 * Free identifiers are never obtained by regex (repo rule). Texts carry
 * `LoopChildReactiveText.freeIdentifiers` from the analyzer; attrs have no
 * such field, so their expression is run through `parseExpression` +
 * `freeIdentifiers` (`expression-parser.ts`) — both of which fail SAFE, the
 * latter returning `null` on an `unsupported` node, which
 * `classifyLazyBinding` turns into "reads both, and opaque".
 */

import { freeIdentifiers, parseExpression } from '../../../expression-parser.ts'
import { pickAttrMeta, type AttrMeta } from '../../../types.ts'
import { extractFreeIdentifiersFromText } from '../../csr-substitute.ts'
import { wrapLoopParamAsAccessor, PROPS_PARAM } from '../../utils.ts'
import type { BranchLoop, ClientJsContext, TopLevelLoop } from '../../types.ts'
import {
  classifyLazyBinding,
  lazyRowEligibility,
  type ClassifiedLazyBinding,
  type LazyRowEligibility,
  type LazyRowScopeInfo,
  type LazyRowShapeFacts,
} from './lazy-row-eligibility.ts'

/** One reactive attribute of a lazy row. */
export interface LazyRowAttrBinding {
  slotId: string
  attrName: string
  /** Already wrapped via `wrapLoopParamAsAccessor` — reads `<param>()`. */
  wrappedExpression: string
  meta: AttrMeta
  /** Index into `entry.refs` holding this slot's element. */
  refIndex: number
  /** Index into `entry.last` holding this binding's dedup value. */
  ordinal: number
  readsItem: boolean
  readsOuter: boolean
}

/** One reactive outer text of a lazy row. Item-driven only (see §9.4 gate). */
export interface LazyRowTextBinding {
  slotId: string
  wrappedExpression: string
  ordinal: number
  readsItem: boolean
}

export interface LazyRowPlanData {
  /** Distinct attr slot ids, in declaration order — `entry.refs[0..n-1]`. */
  attrSlotIds: readonly string[]
  attrs: readonly LazyRowAttrBinding[]
  texts: readonly LazyRowTextBinding[]
  /** Index into `entry.refs` holding the claimed-slot writer; -1 when no texts. */
  writerIndex: number
  /** Total `entry.last` slots. */
  lastCount: number
  /**
   * Signal / memo getters read at the top of `applyOuter` so the ONE
   * loop-level effect subscribes even while the entry list is empty. Empty
   * ⇒ no `applyOuter` is emitted at all (and hydration does literally
   * nothing per row).
   */
  outerPrimeGetters: readonly string[]
  /** True when at least one binding is outer-involving. */
  hasOuter: boolean
}

export interface BuildLazyRowArgs {
  loop: TopLevelLoop | BranchLoop
  /** Fully-chained array expression as emitted (`buildChainedArrayExpr`). */
  arrayExpr: string
  indexParam: string
  /** `destructureLoopParam(...).unwrap` — non-empty ⇒ ineligible. */
  paramUnwrap: string
  mapPreambleWrapped: string
  preambleRegionCount: number
  callSite: 'plain' | 'branch-plain'
  flatMapLeafItem: boolean
  anchored: boolean
  scope: LazyRowScopeInfo | undefined
}

/**
 * Returns the lazy row plan when eligible, otherwise `null` plus the
 * decision (exposed for tests / diagnostics via {@link decideLazyRow}).
 */
export function buildLazyRowPlan(args: BuildLazyRowArgs): LazyRowPlanData | null {
  return decideLazyRow(args).plan
}

export function decideLazyRow(args: BuildLazyRowArgs): {
  plan: LazyRowPlanData | null
  decision: LazyRowEligibility
} {
  const { loop, scope } = args
  if (!scope) {
    return { plan: null, decision: { eligible: false, reason: 'no component scope info supplied' } }
  }

  const wrap = (expr: string) => wrapLoopParamAsAccessor(expr, loop.param, loop.paramBindings)
  const rowLocalNames = new Set<string>([loop.param])
  for (const b of loop.paramBindings ?? []) rowLocalNames.add(b.name)

  // --- classify every binding -------------------------------------------
  const classified: ClassifiedLazyBinding[] = []
  const attrClass = new Map<number, ClassifiedLazyBinding>()
  loop.bindings.reactiveAttrs.forEach((attr, i) => {
    const c = classifyLazyBinding({
      kind: 'attr',
      slotId: attr.childSlotId,
      free: attrFreeIdentifiers(attr.expression),
      rowLocalNames,
      indexParam: args.indexParam,
      scope,
    })
    attrClass.set(i, c)
    classified.push(c)
  })
  const textClass = new Map<number, ClassifiedLazyBinding>()
  loop.bindings.reactiveTexts.forEach((text, i) => {
    const c = classifyLazyBinding({
      kind: 'text',
      slotId: text.slotId,
      free: text.freeIdentifiers ?? null,
      rowLocalNames,
      indexParam: args.indexParam,
      scope,
    })
    textClass.set(i, c)
    classified.push(c)
  })

  // --- §9.4 gate ---------------------------------------------------------
  const shape: LazyRowShapeFacts = {
    callSite: args.callSite,
    flatMapLeafItem: args.flatMapLeafItem,
    anchored: args.anchored,
    bodyIsMultiRoot: loop.bodyIsMultiRoot ?? false,
    hasExplicitKey: loop.key != null,
    conditionalCount: loop.bindings.conditionals?.length ?? 0,
    childRefCount: loop.bindings.refs?.length ?? 0,
    nestedComponentCount: loop.nestedComponents?.length ?? 0,
    innerLoopCount: loop.innerLoops?.length ?? 0,
    hasChildComponent: 'childComponent' in loop && loop.childComponent != null,
    hasMapPreamble: args.mapPreambleWrapped.length > 0,
    preambleRegionCount: args.preambleRegionCount,
    hasParamUnwrap: args.paramUnwrap.length > 0,
  }

  const decision = lazyRowEligibility({
    shape,
    bindings: classified,
    arraySourceIdentifiers: loopSourceIdentifiers(loop, args.arrayExpr),
    scope,
  })
  if (!decision.eligible) return { plan: null, decision }

  // --- layout ------------------------------------------------------------
  const attrSlotIds: string[] = []
  for (const attr of loop.bindings.reactiveAttrs) {
    if (!attrSlotIds.includes(attr.childSlotId)) attrSlotIds.push(attr.childSlotId)
  }

  let ordinal = 0
  const attrs: LazyRowAttrBinding[] = loop.bindings.reactiveAttrs.map((attr, i) => {
    const c = attrClass.get(i)!
    return {
      slotId: attr.childSlotId,
      attrName: attr.attrName,
      wrappedExpression: wrap(attr.expression),
      meta: pickAttrMeta(attr),
      refIndex: attrSlotIds.indexOf(attr.childSlotId),
      ordinal: ordinal++,
      readsItem: c.readsItem,
      readsOuter: c.readsOuter,
    }
  })
  const texts: LazyRowTextBinding[] = loop.bindings.reactiveTexts.map((text, i) => {
    const c = textClass.get(i)!
    return {
      slotId: text.slotId,
      wrappedExpression: wrap(text.expression),
      ordinal: ordinal++,
      // Outer-involving texts are refused by the gate, so an item-only text
      // that somehow classified as neither still gets applied on item change
      // (harmless, dedup-guarded) rather than silently never being written.
      readsItem: true,
    }
  })

  const outerPrimeGetters: string[] = []
  for (const c of classified) {
    for (const name of c.reactiveOuterNames) {
      if (!outerPrimeGetters.includes(name)) outerPrimeGetters.push(name)
    }
  }

  return {
    plan: {
      attrSlotIds,
      attrs,
      texts,
      writerIndex: texts.length > 0 ? attrSlotIds.length : -1,
      lastCount: ordinal,
      outerPrimeGetters,
      hasOuter: attrs.some(a => a.readsOuter),
    },
    decision,
  }
}

/**
 * Project a `ClientJsContext` down to the name facts the §9.4 gate resolves
 * against. Built once per component and threaded into every loop plan
 * builder, so the gate never reaches back into the whole context.
 */
export function buildLazyRowScopeInfo(ctx: ClientJsContext): LazyRowScopeInfo {
  const signals = new Map<string, { initializerFreeIdentifiers: ReadonlySet<string> | null }>()
  for (const s of ctx.signals) {
    signals.set(s.getter, {
      // `parsed` is the analyzer's structured initializer. Absent (or
      // refused by `freeIdentifiers`) ⇒ unprovable, which the source gate
      // treats as a hard stop rather than an assumption.
      initializerFreeIdentifiers: s.parsed ? freeIdentifiers(s.parsed) : null,
    })
  }
  const memos = new Set(ctx.memos.map(m => m.name))
  const props = new Set<string>([PROPS_PARAM])
  if (ctx.propsObjectName) props.add(ctx.propsObjectName)
  for (const p of ctx.propsParams) props.add(p.name)
  const constants = new Map<string, ReadonlySet<string> | null>()
  for (const c of ctx.localConstants) {
    constants.set(c.name, c.freeIdentifiers ?? null)
  }
  const inert = new Set<string>()
  for (const f of ctx.localFunctions) inert.add(f.name)
  for (const imp of ctx.imports) {
    if (imp.isTypeOnly) continue
    for (const spec of imp.specifiers) inert.add(spec.alias || spec.name)
  }
  return { signals, memos, props, constants, inert, profile: ctx.profile }
}

/**
 * Free identifiers of a reactive-attr expression. `LoopChildReactiveAttr`
 * carries none (unlike `LoopChildReactiveText`), so parse it structurally —
 * `freeIdentifiers` returns `null` on an `unsupported` node, which is the
 * fail-safe signal `classifyLazyBinding` expects.
 */
function attrFreeIdentifiers(expression: string): ReadonlySet<string> | null {
  if (!expression || expression.trim().length === 0) return new Set()
  try {
    return freeIdentifiers(parseExpression(expression))
  } catch {
    return null
  }
}

/**
 * §9.3(2) source names: the IR's pre-computed `arrayFreeIdentifiers` UNIONED
 * with the free identifiers of the fully-chained expression actually emitted
 * — `arrayFreeIdentifiers` describes `loop.array` alone, so a
 * `.filter(t => t.done === showDone())` / `.sort(...)` chain would otherwise
 * smuggle an unvetted dependency past the gate. `extractFreeIdentifiersFromNode`
 * (via `...FromText`) scopes arrow parameters, so the predicate's own param
 * never shows up as a free name. Returns `null` when the IR carried no
 * pre-computed set — the gate refuses rather than assuming empty.
 */
function loopSourceIdentifiers(
  loop: TopLevelLoop | BranchLoop,
  arrayExpr: string,
): ReadonlySet<string> | null {
  if (!loop.arrayFreeIdentifiers) return null
  const names = new Set<string>(loop.arrayFreeIdentifiers)
  for (const name of extractFreeIdentifiersFromText(arrayExpr)) names.add(name)
  return names
}
