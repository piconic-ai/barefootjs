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
 *     const __lzc_<mid> = (__e) => { … }                          // lazy ref claim for ADOPTED rows
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
 * Claims refs lazily through `__lzc_<mid>` (a `qsa`/`lazySlots` scan inside
 * that ONE row) when `entry.refs` is null, then writes each item-driven
 * binding behind a per-binding dedup on `entry.last`.
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
 *    (§9.5c(1), lifted) — see `refParts` for the per-loop door choice.
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
import type { LazyRowAttrBinding, LazyRowPlanData, LazyRowTextBinding } from '../plan/build-lazy-row.ts'

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
  const claimVar = `__lzc_${mid}`
  const hasRefs = lazyRow.attrSlotIds.length > 0 || lazyRow.texts.length > 0
  const hasBindings = lazyRow.attrs.length > 0 || lazyRow.texts.length > 0
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

  // Lazy ref claim for ADOPTED (SSR) rows: one scan inside that row, cached
  // on `entry.refs`. Shared by applyItem and applyOuter so a row claims once.
  if (hasRefs) {
    lines.push(`${indent}const ${claimVar} = (__e) => {`)
    lines.push(`${indent}  const __el = __e.primaryEl`)
    lines.push(`${indent}  return [${refParts(lazyRow, '__el', null, null).join(', ')}]`)
    lines.push(`${indent}}`)
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
  const cloneExpr = useHoisted
    ? hoistedCloneExpr(tplVar, o.skeletonTemplate!)
    : `(() => { ${emitTemplateCloneInline(o.template)} })()`
  lines.push(`${b2}const __el = ${cloneExpr}`)
  if (hasRefs) {
    lines.push(`${b2}const __r = __e.refs = [${refParts(lazyRow, '__el', useHoisted ? (paths ?? null) : null, textPathVar).join(', ')}]`)
  }
  if (hasBindings) {
    lines.push(`${b2}const __l = __e.last = []`)
    for (const a of lazyRow.attrs) emitAttrBinding(lines, b2, a, 'create')
    for (const t of lazyRow.texts) emitTextBinding(lines, b2, t, lazyRow.writerIndex, 'create', rwDoor)
  }
  lines.push(`${b2}return __el`)
  lines.push(`${b1}},`)

  // --- applyItem ---------------------------------------------------------
  const itemAttrs = lazyRow.attrs.filter(a => a.readsItem)
  const itemTexts = lazyRow.texts.filter(t => t.readsItem)
  if (itemAttrs.length === 0 && itemTexts.length === 0) {
    lines.push(`${b1}applyItem: () => {},`)
  } else {
    lines.push(`${b1}applyItem: (__e) => {`)
    lines.push(`${b2}const ${paramHead} = () => __e.item`)
    lines.push(`${b2}const __r = __e.refs ?? (__e.refs = ${claimVar}(__e))`)
    lines.push(`${b2}const __l = __e.last ?? (__e.last = [])`)
    for (const a of itemAttrs) emitAttrBinding(lines, b2, a, 'item')
    for (const t of itemTexts) emitTextBinding(lines, b2, t, lazyRow.writerIndex, 'item', rwDoor)
    lines.push(`${b1}},`)
  }

  // --- applyOuter (only when some binding is outer-involving) -------------
  const outerAttrs = lazyRow.attrs.filter(a => a.readsOuter)
  const outerTexts = lazyRow.texts.filter(t => t.readsOuter)
  if (outerAttrs.length > 0 || outerTexts.length > 0) {
    const b3 = `${indent}      `
    lines.push(`${b1}applyOuter: (__es, __seed) => {`)
    // Prime the outer reads so this ONE loop-level effect subscribes even
    // when the entry list is momentarily empty (see module docstring).
    for (const g of lazyRow.outerPrimeGetters) lines.push(`${b2}${g}()`)
    lines.push(`${b2}for (const __e of __es) {`)
    lines.push(`${b3}const ${paramHead} = () => __e.item`)
    lines.push(`${b3}const __r = __e.refs ?? (__e.refs = ${claimVar}(__e))`)
    lines.push(`${b3}const __l = __e.last ?? (__e.last = [])`)
    for (const a of outerAttrs) emitAttrBinding(lines, b3, a, 'outer')
    for (const t of outerTexts) emitTextBinding(lines, b3, t, lazyRow.writerIndex, 'outer', rwDoor)
    lines.push(`${b2}}`)
    lines.push(`${b1}},`)
  }

  lines.push(`${indent}}, '${o.markerId}')`)
}

/**
 * The `entry.refs` array contents: one element ref per reactive-attr slot
 * (in `attrSlotIds` order), then — when the row has text slots — the
 * claimed-slot door at `writerIndex`.
 *
 * **Which door (per LOOP, never per binding).** `lazySlots` returns a bare
 * write function; `lazyClaimSlots` returns the `{ write, read }` pair over
 * the SAME claim, at the cost of an extra closure on EVERY row of the list
 * (`claim-slots.ts` measured ~40-84KB/1k rows). So the RW door is taken only
 * when this loop actually has an outer-involving text binding to seed by
 * read-compare-write (`plan.textNeedsRead`, decided once in
 * `build-lazy-row.ts`); every other loop keeps today's writer byte-for-byte.
 *
 * **Honest cost note.** Reading a text slot CLAIMS that row's whole plan
 * (§2's claim-once rule — `read` and `write` share `claimRefs`), so a loop
 * with an outer-involving text pays one claim per row at hydration instead
 * of the row-pristine zero. That is inherent to read-compare-write for
 * content: you cannot compare what you have not resolved. It is still far
 * cheaper than the eager path this replaces, which pays a root + a signal +
 * an effect per row. Attr-only loops are entirely unaffected — they keep the
 * write-only door and never claim at seed.
 *
 * `skeletonPaths` non-null = fresh-clone context (`createRow`): resolve via
 * compile-time child-index chains, no scan. Null = adopted-row context
 * (`__lzc_<mid>`): `qsa` + an empty claim path, which A2's marker scan
 * resolves — the sanctioned "cannot be statically pathed" case for a
 * server-rendered tree the skeleton does not describe (§5-A3).
 */
function refParts(
  lazyRow: LazyRowPlanData,
  elVar: string,
  skeletonPaths: SkeletonSlotPaths | null,
  textPathVar: string | null,
): string[] {
  const parts: string[] = []
  for (const slotId of lazyRow.attrSlotIds) {
    const path = skeletonPaths?.elementPaths.get(slotId)
    parts.push(path ? pathExpr(elVar, path) : `qsa(${elVar}, '[bf="${slotId}"]')`)
  }
  if (lazyRow.texts.length > 0) {
    const slots: ClaimSlotSpec[] = lazyRow.texts.map((t, i) => ({
      id: t.slotId,
      kind: 'text',
      path: [],
      pathExpr: textPathVar ? `${textPathVar}[${i}]` : undefined,
    }))
    const door = lazyRow.textNeedsRead ? 'lazyClaimSlots' : 'lazySlots'
    parts.push(`${door}(${elVar}, ${claimPlanLiteral(slots)})`)
  }
  return parts
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
  lines.push(`${ind}{ const __t = __r[${a.refIndex}]`)
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
 * claimed, or not a 'text' slot) and `null !== String(__x)` is always true,
 * so the comparison already fails safe into "write it" — no explicit null
 * handling is needed or wanted here.
 */
function emitTextBinding(
  lines: string[],
  ind: string,
  t: LazyRowTextBinding,
  writerIndex: number,
  mode: 'create' | 'item' | 'outer',
  rwDoor: boolean,
): void {
  lines.push(`${ind}{ const __x = ${t.wrappedExpression}`)
  const doorExpr = `__r[${writerIndex}]`
  const write = rwDoor
    ? `${doorExpr}.write('${t.slotId}', String(__x))`
    : `${doorExpr}('${t.slotId}', String(__x))`
  const guard = mode === 'create'
    ? null
    : mode === 'item'
      ? dedupGuard(t.ordinal)
      : `__seed ? (${doorExpr}.read('${t.slotId}') !== String(__x)) : (${dedupGuard(t.ordinal)})`
  if (guard) {
    lines.push(`${ind}if (${guard}) ${write}`)
  } else {
    lines.push(`${ind}${write}`)
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
