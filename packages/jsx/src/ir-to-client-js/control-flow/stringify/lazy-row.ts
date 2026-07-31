/**
 * Emit a lazy row graph loop — `mapArrayLazy(...)` + a compiler-built
 * `LazyRowPlan` object literal (`spec/slot-unification.md` §9, L3).
 *
 * This is the alternative to `stringifyPlainLoop`'s `mapArray` + renderItem
 * emission, taken only when `lazyRowEligibility` said yes (see
 * `plan/lazy-row-eligibility.ts`). Every ineligible loop keeps today's
 * emission byte-for-byte — sound-or-loud, no silent third path.
 *
 * Output shape:
 *
 *     const __tpl_<mid> = document.createElement('template')      // hoisted skeleton, when usable
 *     __tpl_<mid>.innerHTML = `…`
 *     const __lzp_<mid> = [...]                                   // hoisted fresh-clone text paths, when usable
 *     const __lzs_<mid> = [{ id, kind: 'text', path: [] }, …]      // hoisted claim plan, ADOPTED-row form
 *     const __lzsc_<mid> = [{ id, kind: 'text', path: __lzp_<mid>[i] }, …]  // FRESH-CLONE form, only when it differs
 *     const __lzc_<mid> = (__e) => { … }                          // lazy ref claim for ADOPTED rows (door slot empty)
 *     mapArrayLazy(() => <arr>, <container>, <keyFn>, {
 *       createRow: (__e, <idx>) => { … writes every binding, seeds refs+last … },
 *       applyItem: (__e) => { … item-driven bindings, dedup against __e.last … },
 *       applyOuter: (__es, __seed) => { … one loop-level effect body … },
 *     }, '<markerId>')
 *
 * Three shapes carry the plan's obligations (runtime docstring,
 * `packages/client/src/runtime/map-array-lazy.ts`):
 *
 * **`createRow`** — CSR creation. Clones the row, resolves refs from KNOWN
 * clone paths (the hoisted skeleton's `__p`-style child-index chains, reused
 * verbatim from #2143 via `pathExpr`) with no scan, writes ALL bindings
 * (item-driven and outer-involving alike) and seeds `entry.last` so the
 * loop-level outer effect's dedup is correct from the row's first tick.
 *
 * **`applyItem`** — called by the reconciler after `entry.item` changed.
 * Claims refs lazily through `__lzc_<mid>` (a `qsa` scan inside that ONE row)
 * when `entry.refs` is null, materializes the content door on demand
 * (`doorAccess`), then writes each item-driven binding behind a per-binding
 * dedup on `entry.last`.
 *
 * **`applyOuter`** — the ONE loop-level effect body, emitted only when some
 * binding is outer-involving. Two details matter:
 *
 *  - **Prime reads first.** The effect subscribes to whatever its body reads.
 *    With an empty entry list the per-row loop reads nothing, so the effect
 *    would never subscribe and the loop would go permanently dead. The plan
 *    therefore emits a bare `getter()` statement per reactive outer name
 *    BEFORE the row loop. The eligibility gate guarantees every reactive
 *    outer name is a primable zero-arg signal/memo getter.
 *  - **Read-compare-write seeding (§9.3(1)).** On the first run (`__seed`)
 *    each binding computes its value, READS the current DOM, and writes only
 *    on difference — sound even when the outer state is client-only and
 *    diverges from SSR, with no writes on the consistent path. The DOM read
 *    is per attribute KIND and pairs with `emitAttrUpdate`'s dispatch
 *    (`emit-reactive.ts`); any kind this module does not recognise falls back
 *    to `true` (always write on seed), which is conservative, never wrong.
 *    CONTENT slots seed the same way through the claim's `read(id)` door
 *    (§9.5, lifted) — see `refParts` for the per-loop door choice.
 *
 * A loop with NO outer binding emits no `applyOuter` at all — its rows do
 * literally nothing at hydration.
 */

import { isBooleanAttr } from '../../../html-constants.ts'
import { emitAttrUpdate } from '../../emit-reactive.ts'
import { toHtmlAttrName } from '../../utils.ts'
import type { SkeletonSlotPaths } from '../../html-template.ts'
import { claimPlanLiteral, type ClaimSlotSpec } from './claim-plan.ts'
import { pathExpr } from './skeleton-paths.ts'
import {
  emitHoistedTemplateDecl,
  emitTemplateCloneInline,
  hoistedCloneExpr,
} from './template-parse.ts'
import type {
  LazyRowAttrBinding,
  LazyRowConditionalBinding,
  LazyRowPlanData,
  LazyRowTextBinding,
} from '../plan/build-lazy-row.ts'

export interface StringifyLazyRowOptions {
  /** Indent of the `mapArrayLazy(` line itself. */
  indent: string
  containerVar: string
  /** Wrap the call in `if (<containerVar>) …` — branch-scoped loops do. */
  guardContainer: boolean
  markerId: string
  arrayExpr: string
  keyFn: string
  paramHead: string
  indexParam: string
  /** Per-row interpolated template (the non-hoisted clone source). */
  template: string
  skeletonTemplate?: string
  skeletonPaths?: SkeletonSlotPaths
  lazyRow: LazyRowPlanData
}

export function stringifyLazyRowLoop(lines: string[], o: StringifyLazyRowOptions): void {
  const { indent, lazyRow, paramHead } = o
  const mid = o.markerId.replace(/[^A-Za-z0-9_$]/g, '_')
  const tplVar = `__tpl_${mid}`
  const hasRefs = lazyRow.attrSlotIds.length > 0 || lazyRow.texts.length > 0
  // Conditionals count: `createRow` seeds their dedup boolean into `__l`, so a
  // row whose ONLY reactive thing is a conditional still needs `__l` declared.
  const hasBindings =
    lazyRow.attrs.length > 0 || lazyRow.texts.length > 0 || lazyRow.conditionals.length > 0
  // ONE per-loop door decision (see `refParts`): the read-capable claim, or
  // today's write-only writer. Never decided per binding — the door is
  // allocated once per ROW.
  const rwDoor = lazyRow.textNeedsRead

  // Hoisted once-per-loop skeleton (perf, #2143): clone an already-parsed
  // node per row instead of re-running an `innerHTML` parse. The skeleton
  // omits dynamic ATTRIBUTE VALUES and empties text markers but keeps every
  // `bf="sN"` attribute and `<!--bf:sN-->` marker, so a slot with no
  // compile-time path still resolves by scan against the clone — same
  // per-slot fallback the eager `__p` path takes (`buildSkeletonPathPlan`
  // simply omits pathless slots).
  const paths = o.skeletonPaths
  const useHoisted = Boolean(o.skeletonTemplate)

  if (useHoisted) emitHoistedTemplateDecl(lines, indent, tplVar, o.skeletonTemplate!)

  // Hoisted fresh-clone claim paths for this loop's text slots, REFERENCED
  // (not inlined) by `createRow`'s claim plan. Two reasons, both load-bearing:
  //
  //  1. One array per loop instead of one per row — `createRow` runs per CSR
  //     row and would otherwise re-allocate every path literal.
  //  2. These paths describe the SKELETON CLONE, not the server-rendered
  //     tree, and they are ROW-relative — resolving them from the component
  //     scope root (which is what an SSR-shape checker can see) is
  //     meaningless. That is the same situation `ClaimSlotSpec.pathExpr`
  //     exists for on the eager path (`__existing ? [] : […]`), and the
  //     claim-plan conformance harness (`adapter-tests/src/
  //     claim-plan-conformance.ts`) correctly verifies only literal
  //     `number[]` paths. Adopted (SSR) rows never use these — `__lzc_<mid>`
  //     claims with `path: []`, the sanctioned marker-scan case.
  const textPathVar = useHoisted && paths && lazyRow.texts.length > 0 ? `__lzp_${mid}` : null
  if (textPathVar) {
    const arrays = lazyRow.texts.map(t => `[${(paths!.textMarkerPaths.get(t.slotId) ?? []).join(', ')}]`)
    lines.push(`${indent}const ${textPathVar} = [${arrays.join(', ')}]`)
  }

  // Hoisted claim-plan literal(s) for this loop's text slots (perf): a
  // `ClaimPlan` is `readonly SlotSpec[]` (`claim-slots.ts:145`) and
  // `claimRefs` (line 601) only ever READS it — there is no `spec.<field> = `
  // assignment anywhere in that module, and `claimSlots`/`claimRefs` build a
  // fresh `Map` per call — so one shared plan object is safe across every
  // row of the loop instead of a fresh `{ id, kind, path }` object (plus,
  // when `textPathVar` is null, a fresh inner `path: []` array) per row.
  // `__lzs_<mid>` is the ADOPTED-row form (`path: []`, resolved by A2's
  // marker scan); `__lzsc_<mid>` is the FRESH-CLONE form (each slot's path
  // is a `__lzp_<mid>` lookup) and is only emitted when it differs from the
  // adopted form — i.e. when `textPathVar` is non-null.
  let adoptedPlanVar: string | null = null
  let freshPlanVar: string | null = null
  if (lazyRow.texts.length > 0) {
    adoptedPlanVar = `__lzs_${mid}`
    const adoptedSlots: ClaimSlotSpec[] = lazyRow.texts.map(t => ({ id: t.slotId, kind: 'text', path: [] }))
    lines.push(`${indent}const ${adoptedPlanVar} = ${claimPlanLiteral(adoptedSlots)}`)
    if (textPathVar) {
      freshPlanVar = `__lzsc_${mid}`
      const freshSlots: ClaimSlotSpec[] = lazyRow.texts.map((t, i) => ({
        id: t.slotId,
        kind: 'text',
        path: [],
        pathExpr: `${textPathVar}[${i}]`,
      }))
      lines.push(`${indent}const ${freshPlanVar} = ${claimPlanLiteral(freshSlots)}`)
    } else {
      freshPlanVar = adoptedPlanVar
    }
  }

  // Hoisted arm templates, one pair per conditional. Both arms are static by
  // construction (`analyzeLazyConditional`), so each is parsed ONCE per loop and
  // cloned on a flip — a per-row `innerHTML` parse would undo the point of
  // driving the swap from the loop level. The comparison the seed run makes is
  // against `content.firstElementChild.outerHTML`, i.e. the browser's OWN
  // serialization of the same markup, so it cannot false-mismatch on attribute
  // order or quoting the way comparing against the authored string would.
  for (const c of lazyRow.conditionals) {
    const v = condVars(mid, c.slotId)
    emitHoistedTemplateDecl(lines, indent, v.trueTpl, c.whenTrueHtml)
    emitHoistedTemplateDecl(lines, indent, v.falseTpl, c.whenFalseHtml)
  }

  const call = `mapArrayLazy(() => ${o.arrayExpr}, ${o.containerVar}, ${o.keyFn}, {`
  lines.push(`${indent}${o.guardContainer ? `if (${o.containerVar}) ` : ''}${call}`)

  // --- createRow ---------------------------------------------------------
  const b1 = `${indent}  `
  const b2 = `${indent}    `
  lines.push(`${b1}createRow: (__e, ${o.indexParam}) => {`)
  // Always bound, even with no reactive bindings: the non-hoisted clone
  // interpolates the per-row template, which reads the param for at least
  // the `data-key` attribute.
  lines.push(`${b2}const ${paramHead} = () => __e.item`)
  // The row's `.map()` callback preamble, before the clone: a non-hoisted
  // per-row template interpolates values the preamble declares. Only
  // `createRow` needs it — a BINDING that reads a preamble local refuses the
  // loop (`lazyRowEligibility`), so the apply bodies never reference one.
  if (lazyRow.preambleStatements) lines.push(`${b2}${lazyRow.preambleStatements}`)
  const cloneExpr = useHoisted
    ? hoistedCloneExpr(tplVar, o.skeletonTemplate!)
    : `(() => { ${emitTemplateCloneInline(o.template)} })()`
  lines.push(`${b2}const __el = ${cloneExpr}`)
  if (hasRefs) {
    lines.push(`${b2}const __r = __e.refs = [${refParts(lazyRow, '__el', useHoisted ? (paths ?? null) : null, freshPlanVar).join(', ')}]`)
  }
  if (hasBindings) {
    lines.push(`${b2}const __l = __e.last = []`)
    for (const a of lazyRow.attrs) emitAttrBinding(lines, b2, a, 'create')
    const createDoor = `__r[${lazyRow.writerIndex}]`
    for (const t of lazyRow.texts) emitTextBinding(lines, b2, t, createDoor, 'create', rwDoor)
  }
  for (const c of lazyRow.conditionals) emitConditional(lines, b2, mid, c, 'create')
  lines.push(`${b2}return __el`)
  lines.push(`${b1}},`)

  // --- applyItem ---------------------------------------------------------
  const itemAttrs = lazyRow.attrs.filter(a => a.readsItem)
  const itemTexts = lazyRow.texts.filter(t => t.readsItem)
  const itemConds = lazyRow.conditionals.filter(c => c.readsItem)
  if (itemAttrs.length === 0 && itemTexts.length === 0 && itemConds.length === 0) {
    lines.push(`${b1}applyItem: () => {},`)
  } else {
    lines.push(`${b1}applyItem: (__e) => {`)
    lines.push(`${b2}const ${paramHead} = () => __e.item`)
    lines.push(`${b2}const __r = __e.refs ?? (__e.refs = [])`)
    lines.push(`${b2}const __l = __e.last ?? (__e.last = [])`)
    for (const a of itemAttrs) emitAttrBinding(lines, b2, a, 'item')
    if (itemTexts.length > 0) {
      lines.push(`${b2}const __d = ${doorAccess(lazyRow, lazyRow.writerIndex, adoptedPlanVar)}`)
      for (const t of itemTexts) emitTextBinding(lines, b2, t, '__d', 'item', rwDoor)
    }
    for (const c of itemConds) emitConditional(lines, b2, mid, c, 'item')
    lines.push(`${b1}},`)
  }

  // --- applyOuter (only when some binding is outer-involving) -------------
  const outerAttrs = lazyRow.attrs.filter(a => a.readsOuter)
  const outerTexts = lazyRow.texts.filter(t => t.readsOuter)
  const outerConds = lazyRow.conditionals.filter(c => c.readsOuter)
  if (outerAttrs.length > 0 || outerTexts.length > 0 || outerConds.length > 0) {
    const b3 = `${indent}      `
    lines.push(`${b1}applyOuter: (__es, __seed) => {`)
    // Prime the outer reads so this ONE loop-level effect subscribes even
    // when the entry list is momentarily empty (see module docstring).
    for (const g of lazyRow.outerPrimeGetters) lines.push(`${b2}${g}()`)
    lines.push(`${b2}for (const __e of __es) {`)
    lines.push(`${b3}const ${paramHead} = () => __e.item`)
    lines.push(`${b3}const __r = __e.refs ?? (__e.refs = [])`)
    lines.push(`${b3}const __l = __e.last ?? (__e.last = [])`)
    for (const a of outerAttrs) emitAttrBinding(lines, b3, a, 'outer')
    if (outerTexts.length > 0) {
      lines.push(`${b3}const __d = ${doorAccess(lazyRow, lazyRow.writerIndex, adoptedPlanVar)}`)
      for (const t of outerTexts) emitTextBinding(lines, b3, t, '__d', 'outer', rwDoor)
    }
    for (const c of outerConds) emitConditional(lines, b3, mid, c, 'outer')
    lines.push(`${b2}}`)
    lines.push(`${b1}},`)
  }

  lines.push(`${indent}}, '${o.markerId}')`)
}

/**
 * The `entry.refs` array `createRow` seeds: one element ref per reactive-attr
 * slot (in `attrSlotIds` order), then — when the row has text slots — the
 * claimed-slot door at `writerIndex`. Fresh-clone context only; an ADOPTED row
 * starts empty and fills each slot on demand (`elementAccess` / `doorAccess`).
 *
 * **Which door (per LOOP, never per binding).** `lazySlots` returns a bare
 * write function; `lazyClaimSlots` returns the `{ write, read }` pair over
 * the SAME claim, at the cost of an extra closure on EVERY row of the list
 * (`claim-slots.ts` measured ~40-84KB/1k rows). So the RW door is taken only
 * when this loop actually has an outer-involving text binding to seed by
 * read-compare-write (`plan.textNeedsRead`, decided once in
 * `build-lazy-row.ts`); every other loop keeps today's writer byte-for-byte.
 *
 * **`deferDoor`** (adopted-row claim only). Even the cheap write-only door is
 * a closure per row, and an `applyOuter` that drives ATTRIBUTES only claims
 * every row at seed without ever touching a content slot — so the door was
 * being built 1,000 times for a list of 1,000 rows and used zero times until
 * some row's item changed. With `deferDoor` the slot holds `null` and the
 * first content write fills it (`doorAccess`). Measured on the SSR bench's
 * 1,000-row table (item texts + one outer-signal class, the shape this
 * describes): post-hydration heap 1630.6KB -> 1573.2KB, -57.4KB, reproduced
 * twice, against a per-run stdev of 0.1-0.6KB and with react/solid unmoved.
 *
 * `createRow` does NOT defer: it writes every text on the tick it builds the
 * row, so its door is used immediately and a `??=` would only add a branch.
 *
 * **Honest cost note.** Reading a text slot CLAIMS that row's whole plan
 * (§2's claim-once rule — `read` and `write` share `claimRefs`), so a loop
 * with an outer-involving TEXT still pays one claim per row at hydration
 * instead of the row-pristine zero. That is inherent to read-compare-write
 * for content: you cannot compare what you have not resolved. It is still
 * far cheaper than the eager path this replaces, which pays a root + a
 * signal + an effect per row. A loop whose outer bindings are all attributes
 * now pays neither the claim nor the door.
 *
 * `skeletonPaths` non-null = fresh-clone context (`createRow`): resolve via
 * compile-time child-index chains, no scan. Null = adopted-row context
 * (`__lzc_<mid>`): `qsa` + an empty claim path, which A2's marker scan
 * resolves — the sanctioned "cannot be statically pathed" case for a
 * server-rendered tree the skeleton does not describe (§5-A3).
 *
 * `planVar` is the hoisted claim-plan variable for THIS context (`__lzs_<mid>`
 * for the adopted-row call site, `__lzsc_<mid>` — or the same `__lzs_<mid>`
 * when the two forms coincide — for the fresh-clone one), built once by
 * `stringifyLazyRowLoop` and referenced here rather than rebuilt per row.
 * `null` iff `lazyRow.texts` is empty, the only case that skips the text part
 * below.
 */
function refParts(
  lazyRow: LazyRowPlanData,
  elVar: string,
  skeletonPaths: SkeletonSlotPaths | null,
  planVar: string | null,
): string[] {
  const parts: string[] = []
  for (const slotId of lazyRow.attrSlotIds) {
    const path = skeletonPaths?.elementPaths.get(slotId)
    parts.push(path ? pathExpr(elVar, path) : `qsa(${elVar}, '[bf="${slotId}"]')`)
  }
  if (lazyRow.texts.length > 0) {
    parts.push(`${doorCtor(lazyRow)}(${elVar}, ${planVar})`)
  }
  return parts
}

/**
 * How an ADOPTED row's binding reaches its element ref: claim THIS slot, and
 * only this slot, on first use.
 *
 * The previous shape claimed the whole row in one closure (`__lzc_<mid>`),
 * which meant an `applyOuter` driving ONE attribute still ran a `qsa` scan for
 * every OTHER reactive-attr slot in the row — on every row, at hydration. The
 * `in` test (not `??`) is what makes the cache honest: a slot whose scan found
 * nothing records `undefined` and is not re-scanned on the next tick, which a
 * `??`-guarded cache would do forever.
 *
 * This is the element-ref twin of `doorAccess`, which already deferred the
 * content door for exactly the same reason.
 */
function elementAccess(a: LazyRowAttrBinding): string {
  const slot = `__r[${a.refIndex}]`
  return `${a.refIndex} in __r ? ${slot} : (${slot} = qsa(__e.primaryEl, '[bf="${a.slotId}"]'))`
}

/** The door constructor for this loop — see `refParts`'s "which door" note. */
function doorCtor(lazyRow: LazyRowPlanData): string {
  return lazyRow.textNeedsRead ? 'lazyClaimSlots' : 'lazySlots'
}

/**
 * How a content write reaches this row's door.
 *
 * `createRow` seeds the door itself (fresh-clone plan, used on the same
 * tick), so there it is a plain slot read. An ADOPTED row's slot is `null`
 * until the first content write, so applyItem/applyOuter materialize it
 * on demand against the ADOPTED plan — the only plan an adopted row can
 * use, and reachable here because a row whose refs `createRow` seeded
 * always finds a door already in the slot and never evaluates the `??`
 * right-hand side.
 *
 * Emitted ONCE per apply body rather than per binding, and only when that
 * body actually has content bindings: an `applyOuter` driving attributes
 * only never mentions the door, which is the whole point of deferring it.
 */
function doorAccess(
  lazyRow: LazyRowPlanData,
  writerIndex: number,
  adoptedPlanVar: string | null,
): string {
  const slot = `__r[${writerIndex}]`
  return `${slot} ?? (${slot} = ${doorCtor(lazyRow)}(__e.primaryEl, ${adoptedPlanVar}))`
}

/** Hoisted arm-template variable names for one conditional of one loop. */
function condVars(mid: string, slotId: string): { trueTpl: string; falseTpl: string } {
  const key = `${mid}_${slotId.replace(/[^A-Za-z0-9_$]/g, '_')}`
  return { trueTpl: `__cbt_${key}`, falseTpl: `__cbf_${key}` }
}

/**
 * A row conditional, in the same three modes as {@link emitAttrBinding}.
 *
 * The whole swap is `replaceWith` on the `[bf-c]` element, because
 * `analyzeLazyConditional` has already established that the arms own nothing —
 * no events, no children to init, no live nodes to splice. What `insert()` does
 * per row with an effect of its own, this does with a boolean and a dedup slot.
 *
 * **`'create'` writes no DOM.** The row `createRow` just cloned came from the
 * per-row template, which interpolated `cond ? trueHtml : falseHtml` itself — so
 * the correct arm is already in place and the only thing missing is the dedup
 * record. Swapping here would replace an element with an identical one.
 *
 * **`'outer'` seeds by read-compare-write (§9.3(1))** against
 * `content.firstElementChild.outerHTML` — the browser's serialization of the arm
 * we would install, compared with the serialization of what is there. Both sides
 * go through the DOM, so a match means the server already rendered this arm and
 * no write happens.
 *
 * The ref is REASSIGNED after a swap (`__r[i] = __n`). Without that, the next
 * apply would hold the detached node and write into nothing.
 */
function emitConditional(
  lines: string[],
  ind: string,
  mid: string,
  c: LazyRowConditionalBinding,
  mode: 'create' | 'item' | 'outer',
): void {
  const v = condVars(mid, c.slotId)
  if (mode === 'create') {
    lines.push(`${ind}__l[${c.ordinal}] = !!(${c.wrappedCondition})`)
    return
  }
  const slot = `__r[${c.refIndex}]`
  lines.push(`${ind}{ const __c = ${c.refIndex} in __r ? ${slot} : (${slot} = qsa(__e.primaryEl, '[bf-c="${c.slotId}"]'))`)
  lines.push(`${ind}if (__c) {`)
  lines.push(`${ind}  const __x = !!(${c.wrappedCondition})`)
  lines.push(`${ind}  const __w = (__x ? ${v.trueTpl} : ${v.falseTpl}).content.firstElementChild`)
  const guard = mode === 'item'
    ? dedupGuard(c.ordinal)
    : `__seed ? (__c.outerHTML !== __w.outerHTML) : (${dedupGuard(c.ordinal)})`
  lines.push(`${ind}  if (${guard}) {`)
  lines.push(`${ind}    const __n = __w.cloneNode(true)`)
  lines.push(`${ind}    __c.replaceWith(__n)`)
  lines.push(`${ind}    ${slot} = __n`)
  lines.push(`${ind}  }`)
  lines.push(`${ind}  __l[${c.ordinal}] = __x`)
  lines.push(`${ind}} }`)
}

/** `entry.last`-backed dedup test. `in` (not a truthiness check) so a
 *  legitimately `undefined` value still records and still writes once. */
function dedupGuard(ordinal: number): string {
  return `!(${ordinal} in __l) || !Object.is(__l[${ordinal}], __x)`
}

function emitAttrBinding(
  lines: string[],
  ind: string,
  a: LazyRowAttrBinding,
  mode: 'create' | 'item' | 'outer',
): void {
  // `createRow` seeded every ref from a known clone path, so there it is a
  // plain read. An ADOPTED row starts with an EMPTY `refs` array and each
  // binding claims its OWN slot on first use — see `elementAccess`.
  const target = mode === 'create' ? `__r[${a.refIndex}]` : elementAccess(a)
  lines.push(`${ind}{ const __t = ${target}`)
  lines.push(`${ind}if (__t) {`)
  lines.push(`${ind}  const __x = ${a.wrappedExpression}`)
  const guard = mode === 'create'
    ? null
    : mode === 'item'
      ? dedupGuard(a.ordinal)
      : `__seed ? (${seedDiffersExpr('__t', a)}) : (${dedupGuard(a.ordinal)})`
  const writeIndent = guard ? `${ind}    ` : `${ind}  `
  if (guard) lines.push(`${ind}  if (${guard}) {`)
  for (const stmt of emitAttrUpdate('__t', a.attrName, '__x', a.meta)) {
    lines.push(`${writeIndent}${stmt}`)
  }
  if (guard) lines.push(`${ind}  }`)
  lines.push(`${ind}  __l[${a.ordinal}] = __x`)
  lines.push(`${ind}} }`)
}

/**
 * A content-slot write, in the same three modes as {@link emitAttrBinding}.
 *
 * `'outer'` seeds by read-compare-write (§9.3(1)) through the RW door's
 * `read(id)`. `read` returns `null` when it cannot answer (slot never
 * claimed, or not a 'text' slot) and `null !== <the string>` is always true,
 * so the comparison already fails safe into "write it" — no explicit null
 * handling is needed or wanted here.
 *
 * The `'outer'` mode emits a real `if`/`else if` rather than one ternary
 * guard so the seed branch can bind `textOrNode(__x)` ONCE and use it for
 * both the comparison and the write. A ternary would coerce twice on the
 * seed path, which double-invokes a user value's `toString` — observable
 * when it has side effects, wasted work when it doesn't. Hoisting it above
 * the branch instead would fix that but would also coerce on the non-seed
 * path even when dedup skips the write, i.e. on every later tick; the branch
 * keeps exactly one coercion per path taken.
 *
 * `textOrNode` rather than a bare `String(...)` because a child-position
 * interpolation can evaluate to a live Node (`props.renderRow(item)` handed
 * an inline-JSX arrow), and `String(node)` destroys it. The helper passes a
 * Node through so the claim door can promote the slot to 'markup' and splice
 * it; see `claim-slots.ts`. Whether such a call yields a string or a Node is
 * not decidable from the expression's syntax — both are `CallExpression` —
 * so this stays a runtime decision on the value, not a compile-time
 * classification.
 *
 * A Node also makes the seed comparison fail safe on its own: `read(id)`
 * answers with a string or `null`, neither of which is ever `===` a Node, so
 * the seed always writes. That is the correct direction — a Node is freshly
 * built on this run and is never the SSR-rendered content by identity.
 */
function emitTextBinding(
  lines: string[],
  ind: string,
  t: LazyRowTextBinding,
  doorExpr: string,
  mode: 'create' | 'item' | 'outer',
  rwDoor: boolean,
): void {
  lines.push(`${ind}{ const __x = ${t.wrappedExpression}`)
  const writeOf = (valueExpr: string): string =>
    rwDoor
      ? `${doorExpr}.write('${t.slotId}', ${valueExpr})`
      : `${doorExpr}('${t.slotId}', ${valueExpr})`

  if (mode === 'outer') {
    lines.push(`${ind}if (__seed) {`)
    lines.push(`${ind}  const __s = textOrNode(__x)`)
    lines.push(`${ind}  if (${doorExpr}.read('${t.slotId}') !== __s) ${writeOf('__s')}`)
    lines.push(`${ind}} else if (${dedupGuard(t.ordinal)}) ${writeOf('textOrNode(__x)')}`)
  } else if (mode === 'item') {
    lines.push(`${ind}if (${dedupGuard(t.ordinal)}) ${writeOf('textOrNode(__x)')}`)
  } else {
    lines.push(`${ind}${writeOf('textOrNode(__x)')}`)
  }
  lines.push(`${ind}__l[${t.ordinal}] = __x }`)
}

/**
 * Read-compare-write seeding predicate (§9.3(1)): does the CURRENT DOM
 * differ from the value `__x` this binding would write? Mirrors
 * `emitAttrUpdate`'s per-kind dispatch (`emit-reactive.ts`) — the two must
 * be read together. An unrecognised kind returns `true`, i.e. write on the
 * seed run unconditionally: conservative, never unsound.
 */
function seedDiffersExpr(target: string, a: LazyRowAttrBinding): string {
  const html = toHtmlAttrName(a.attrName)
  if (a.attrName === 'dangerouslySetInnerHTML' || html === 'dangerouslySetInnerHTML') return 'true'
  if (html === 'style') return `${target}.getAttribute('style') !== styleToCss(__x)`
  if (html === 'class') return `${target}.getAttribute('class') !== (__x != null ? String(__x) : null)`
  if (html === 'value') return `${target}.value !== String(__x)`
  if (isBooleanAttr(html)) return `${target}.${html} !== !!(__x)`
  if (a.meta.presenceOrUndefined) {
    // Compare the VALUE the writer would produce, not just presence.
    // `emitAttrUpdate` writes `'true'` for `aria-*` (WAI-ARIA requires an
    // explicit value) and `''` for everything else, while SSR renders these
    // as a BARE attribute name (`templateAttrExpr` in `html-template.ts`),
    // which parses to the empty string. So for `aria-*` the SSR value and
    // the client's value legitimately differ while presence agrees — a
    // presence-only check would skip the seed write and leave
    // `aria-pressed=""` where the eager path produces `aria-pressed="true"`.
    // `getAttribute` returns null when absent, which is exactly the falsy
    // expectation, so one comparison covers both directions.
    const written = html.startsWith('aria-') ? 'true' : ''
    return `${target}.getAttribute('${html}') !== (__x ? '${written}' : null)`
  }
  return `${target}.getAttribute('${html}') !== (__x != null ? String(__x) : null)`
}

/** Exported for the emission-shape unit tests. */
export const __lazyRowInternals = { seedDiffersExpr, dedupGuard }
