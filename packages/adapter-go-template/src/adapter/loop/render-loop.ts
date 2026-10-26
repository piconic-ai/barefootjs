/**
 * Loop lowering (#3425): how an `IRLoop` becomes a Go-template `{{range}}`.
 *
 * - {@link renderLoop} renders a `.map()` loop: the clientOnly markers, the
 *   static-array unroll, the BF104 / BF101 refusals, the row scope and its
 *   loop-variable bookkeeping, the `.sort()` pipeline and the `.filter()`
 *   `{{if}}` gate.
 * - {@link loopRowChildPropOverrides} lowers the props of a child component
 *   nested in a composite loop row that read the row, re-applied per row
 *   through `bf_with_props` / `bf_reprops` / `bf_with_bag`.
 *
 * The adapter's `renderLoop` and its child-component call sites call these
 * free functions over a {@link LoopRenderHost}.
 */

import {
  isEventHandlerName,
  isLowerableLoopDestructure,
  missingFilterPredicateRefusal,
  sortComparatorFromArrow,
  type BindingScope,
  type IRComponent,
  type IRLoop,
  type IRLoopChildComponent,
  type IRNode,
  type IRProp,
  type LoopBindingPathSegment,
  type LoopBindingSource,
  type ParsedExpr,
  type ScopeFrame,
  type SourceLocation,
  type TypeInfo,
} from '@barefootjs/jsx'

import { analyzeBakeableStaticElementLoop } from '../analysis/static-element-loop-bake.ts'
import type { BakedStaticChildLoop } from '../analysis/static-child-loop-bake.ts'
import type { GoEmitContext } from '../emit-context.ts'
import { renderFilterExpr, type ConditionExprHost } from '../expr/condition-expr.ts'
import { lowerValueOperand } from '../expr/url-builder.ts'
import { SCALAR_ROW_ITEM_FIELD } from '../lib/constants.ts'
import { emitBfSort, emitSortEval, wrapIfMultiToken } from '../lib/go-emit.ts'
import { capitalizeFieldName, goFieldNameForKey } from '../lib/go-naming.ts'
import { isFieldlessRowType } from '../lib/loop-row-path.ts'
import type { RowsFieldSite } from '../lib/nested-rows-field.ts'
import { restBagOverrideFields, routesToRestBag, type ChildComponentShape } from '../lib/types.ts'
import { loopRowType } from '../type/number-read.ts'


/**
 * What the loop lowering needs from the adapter beyond the shared
 * {@link GoEmitContext}: the recursive renderers, the render-position state a
 * loop row saves, sets and restores (read and written through accessors, so
 * the module always sees the adapter's current values), the per-compile
 * child-component tables, and the adapter's own scope and loop lookups. Kept
 * out of `GoEmitContext` because only this module reads them.
 */
export interface LoopRenderHost {
  readonly ctx: GoEmitContext
  /** The condition-lowering host a `.filter()` predicate renders through. */
  readonly conditionExprHost: ConditionExprHost
  /** A source location for a diagnostic. */
  makeLoc(): SourceLocation
  /** Render a `ParsedExpr` through the adapter's `ParsedExprEmitter`. */
  renderParsedExpr(expr: ParsedExpr): string
  /** Render a loop row's children. */
  renderChildren(children: IRNode[]): string

  /** The binding scope of the position being rendered. */
  scope(): BindingScope
  setScope(scope: BindingScope): void
  /** Whether the position being rendered is inside a loop row. */
  inLoop(): boolean
  setInLoop(inLoop: boolean): void
  /** The innermost destructure loop's synthetic range variable, or null. */
  innermostDestructureRangeVar(): string | null
  setInnermostDestructureRangeVar(rangeVar: string | null): void
  /** Whether the position being rendered is a scalar wrapper row's call site. */
  scalarWrapperRowCallSite(): boolean
  setScalarWrapperRowCallSite(callSite: boolean): void
  /** The `$name` aliases of enclosing range variables a `.filter()` predicate reads. */
  filterCaptureAliases(): Map<string, string>
  setFilterCaptureAliases(aliases: Map<string, string>): void
  /** Set when an unrolled static loop's body did not resolve against an item. */
  staticLoopBakeFailed(): boolean
  setStaticLoopBakeFailed(failed: boolean): void
  /** Ref-counted `$name` loop variables. */
  loopVarRefCount(): Map<string, number>
  /** Destructure bindings of the enclosing loops, innermost last. */
  loopBindingStack(): Array<Map<string, string>>
  /** A destructure row frame's binding accessors. */
  destructureAccessors(): WeakMap<ScopeFrame, Map<string, string>>
  /** Object-rest exclude keys of the enclosing loops, innermost last. */
  loopRestExcludeStack(): Array<Map<string, { parent: string; excludeKeys: string[] }>>
  /** Whether each enclosing loop's row is a scalar, innermost last. */
  loopScalarItemStack(): boolean[]
  /** Whether each enclosing loop's body is a child component, innermost last. */
  loopWrapperStack(): boolean[]
  /** The items of the enclosing unrolled static loops, innermost last. */
  staticLoopItemStack(): Array<{ param: string; item: unknown }>
  /** The row variables a wrapper-slice row's forwarded-children define rebinds. */
  wrapperRowVarNames(): ReadonlySet<string> | undefined

  /** The memoized bake of a static-array child-component loop. */
  getBakedStaticChildLoop(
    markerId: string,
    childComponent: { props: IRLoopChildComponent['props'] },
    arrayParsed: ParsedExpr | undefined,
    param: string | undefined,
    key: string | undefined,
  ): BakedStaticChildLoop | null
  /** The items of the enclosing unrolled static loops, by param. */
  staticLoopBindings(): ReadonlyMap<string, unknown>
  /** BF101 for a loop over a computed const no template binds. */
  refuseComputedConstLoopSource(loop: IRLoop): void
  /** The Input/Props field holding a child-component loop site's rows. */
  nestedRowsField(site: RowsFieldSite): string
  /** The Go element type of a loop over a primitive-literal array, or null. */
  scalarLiteralLoopGoType(arrayParsed: ParsedExpr | undefined, itemType: TypeInfo | null | undefined): string | null
  /** The Go accessor a loop destructure binds `name` to. */
  lookupDestructureBinding(name: string): string | undefined
  /** Whether `name` is an enclosing loop row's own item (any depth). */
  isOuterRowItem(name: string): boolean
  /** The `$name` range variable of a loop row binding. */
  rowVarRef(name: string): string
  /** Whether a loop binding or loop variable shadows `name`. */
  isLoopShadowedName(name: string): boolean
  /** A child component's declared name (resolves an import alias). */
  resolveChildName(name: string): string
  /** The shape of a child component, by declared name. */
  childShape(declaredName: string): ChildComponentShape | undefined
  /** A child's constructor-derived fields and the fields each reads, by declared name. */
  childDerivedFieldDeps(declaredName: string): Map<string, ReadonlySet<string>> | undefined
  /** Whether a child has a generated props rebuilder, by declared name. */
  childRepropsReady(declaredName: string): boolean
  /** A child's own Props field name for a JSX attribute, by declared name. */
  childPropFieldName(declaredName: string, propName: string): string | undefined
  /** The component that registers each child's props rebuilder. */
  repropsOwner(): Map<string, string>
  /** Whether a lowered value is a template fragment rather than a pipeline. */
  isTemplateFragment(go: string, kind?: ParsedExpr['kind']): boolean
}

/** Render a `.map()` loop as a Go-template `{{range}}` (the adapter's `renderLoop`). */
export function renderLoop(host: LoopRenderHost, loop: IRLoop): string {
  // clientOnly loops: emit SSR markers so the client can insert DOM nodes. The
  // marker id disambiguates sibling `.map()` calls under the same parent.
  if (loop.clientOnly) {
    return `{{bfComment "loop:${loop.markerId}"}}{{bfComment "/loop:${loop.markerId}"}}`
  }

  const supportableDestructure = checkLoopDestructure(host, loop)

  // A loop array that's a bare reference to a local const (module- or
  // function-scope, #2946) with a computed initializer (`const entries =
  // Object.entries(props.x ?? {}).filter(...)`) can't be bound as a Go
  // template value: such a local only reaches the template at all via
  // `computeDerivedConstFields`'s STRING-typed derived-const lowering
  // (`isStringExpr`) — an array-typed initializer like this one never
  // qualifies, so `identifier()` would still emit `.Entries` (the naive
  // `rootFieldRef` fallback) while `generateTypes` emits no such field.
  // `html/template` resolves struct fields dynamically at EXECUTE time, not
  // at Go compile time, so left unchecked this fails loudly only when the
  // template actually runs (`can't evaluate field Entries in type
  // ...Props`) instead of at build time. Pre-existing, general limitation,
  // orthogonal to #2087's destructure-binding work — newly reachable in this
  // adapter's test corpus only because the widened destructure gate (#2087
  // Phase A/B) no longer refuses `static-array-from-props`'s `([emoji,
  // users]) => ...` param first. Cross-adapter policy: Jinja / ERB apply the
  // same narrow check in their own `renderLoop` (see `jinja-adapter.ts`).
  // #2208: a static-array loop whose body is a single child component
  // (`loop.childComponent`) with a plain-value prop set can be BAKED —
  // every per-item prop and data-key resolves to a compile-time-known Go
  // literal (see `analyzeBakeableStaticChildLoop`), so the constructor
  // (`generateNewPropsFunction`'s `staticWithoutBody` path) can emit the
  // child instances directly instead of requiring the loop array bind as
  // a template variable at all. Memoized by marker id so this gate and
  // the constructor's later baking agree. A plain-ELEMENT body (no
  // `childComponent`) is NOT handled by baking and keeps refusing below —
  // see the go-only follow-up issue for that narrower gap.
  const bakedChildLoop = loop.childComponent
    ? host.getBakedStaticChildLoop(loop.markerId, loop.childComponent, loop.arrayParsed, loop.param, loop.key ?? undefined)
    : null

  // #2224 shape 1: a static-array loop whose body is a plain ELEMENT tree
  // (no child component) has no `.{Name}s`-shaped template target for
  // #2208's baking to feed — there's nothing for `{{range}}` to iterate at
  // all once the array itself can't bind as a template variable. Rather
  // than synthesizing a Go struct type for the item shape (see the #2224
  // issue body), unroll the body once per item at template-generation
  // time instead, substituting each item's statically-known field values
  // directly — see `analyzeBakeableStaticElementLoop`'s docstring for the
  // exact (conservative) acceptance gate. `null` here means the shape
  // isn't (yet) bakeable this way; the existing gates below keep firing
  // exactly as before.
  // #2482 Stage 3: `renderLoop` is a live tree-walk, so `host.scope()` (not
  // yet entered for THIS loop's own row — that happens further below)
  // gives the position-accurate ancestor-shadowing answer directly, unlike
  // `getBakedStaticChildLoop` above, which is memoized across sites that
  // run OUTSIDE the tree walk and so must keep its coarse whole-component
  // shadow-name Set (see that method's own comment).
  const bakedElementLoop = loop.childComponent
    ? null
    : analyzeBakeableStaticElementLoop(
        loop,
        host.ctx.state.localConstants,
        { isNameShadowed: host.scope().asShadowPredicate(), bindings: host.staticLoopBindings() },
      )
  if (bakedElementLoop) {
    return renderUnrolledStaticElementLoop(host, loop, bakedElementLoop.items)
  }

  if (bakedChildLoop === null) host.refuseComputedConstLoopSource(loop)

  // #2224 shape 2: when the body IS a child component, `goArray` gets
  // unconditionally overwritten to `.${componentName}s` below regardless
  // of what this call returns — so for an INLINE array-literal source
  // (`[{ label: 'Alpha' }, ...].map(item => <ListItem .../>)`), calling
  // `convertExpressionToGo` on the raw literal text here is pure waste at
  // best. At worst it's actively harmful: an array-literal-of-objects
  // fails the shared `isSupported` gate (`object-literal` is refused
  // standalone — expression-parser.ts), so this call would push a BF101
  // as a side effect even though `bakedChildLoop` above (via
  // `resolveStaticLoopSource`, which evaluates the literal directly
  // instead of going through `isSupported`) already resolved the SAME
  // loop just fine. Skip the call entirely for a child-component body —
  // baked or not, dynamic `.map()` over a real prop/signal array included
  // — so no spurious diagnostic is ever recorded for a value nothing ends
  // up consuming.
  let goArray = loop.childComponent ? '' : host.ctx.convertExpressionToGo(loop.array)
  const param = loop.param
  let index = loop.index || '_'

  // `.keys().map(k => ...)` — the callback param is the *index*, not the value.
  // Swap into the Go range's first binding slot so `{{range $k, $_ := .Arr}}`
  // makes `$k` the 0-based index.
  let rangeIndex = index
  // A supported destructure param can't be the Go range var verbatim
  // (`$__bf_itemN` is a synthetic single name; bindings resolve against it via
  // `loopBindingStack`); otherwise the value var is the param itself. The
  // reserved `__bf_item` prefix avoids colliding with a user binding, and the
  // nesting-depth suffix keeps an inner destructure loop from shadowing an
  // outer one's range var.
  let rangeValue = supportableDestructure ? `__bf_item${host.loopBindingStack().length}` : param
  if (loop.iterationShape === 'keys') {
    rangeIndex = param
    rangeValue = '_'
  }

  // If the loop body IS a single component, range over `.{ComponentName}s`,
  // which carries a ScopeID per item (TodoItem → `.TodoItems`). Gate on the
  // IR's `loop.childComponent` — the SAME condition `findNestedComponents`
  // uses to generate that slice field — not on a deep search of the body:
  // a component merely nested inside an element item (`<li><Badge/></li>`)
  // generates NO `.Badges` slice, so retargeting the range at it 500s at
  // render with `can't evaluate field Badges in type *XxxProps` (#2130).
  // Such loops keep iterating the real collection; the nested child renders
  // through the parent's once-per-slot instance (see `renderComponent`'s
  // non-wrapper in-loop branch).
  if (loop.childComponent) {
    goArray = `.${host.nestedRowsField({ name: loop.childComponent.name, loopMarkerId: loop.markerId })}`
  }

  const { rowType, preambleAssignments, children, itemMarker } = renderLoopRow(host, loop, supportableDestructure, param, rangeIndex, rangeValue)

  // Apply sort if present: wrap the array in a sort pipeline before `range`.
  // Evaluator-first (#2018 P3): serialize the comparator body + emit
  // `bf_sort_eval`, the same path the standalone `callbackMethod` sort arm uses;
  // fall back to the structured `bf_sort` for a comparator the evaluator
  // can't model (e.g. `localeCompare`). The sort runs after the loop-scope
  // cleanup above, so the captured-free-var env renders in the outer scope.
  if (loop.sortComparator) {
    goArray = sortedLoopArray(host, loop.sortComparator, goArray)
  }

  const rowValueDecl = scalarWrapperRowValueDecl(host, loop, rangeValue)

  // filter().map(): gate the body on an `{{if}}` condition.
  if (loop.filterPredicate) {
    return renderFilteredLoop(host, loop, loop.filterPredicate, { goArray, rangeIndex, rangeValue, rowValueDecl, rowType, preambleAssignments, itemMarker, children })
  }

  return `{{bfComment "loop:${loop.markerId}"}}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}${rowValueDecl}${preambleAssignments}${itemMarker}${children}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
}

/** What {@link renderLoopRow} rendered inside a loop's row scope. */
interface LoopRowRender {
  rowType: TypeInfo | null
  preambleAssignments: string
  children: string
  itemMarker: string
}

/**
 * Render a `{{range}}` loop's row: enter the row scope and the loop-variable
 * bookkeeping, render the preamble assignments, the children and the per-item
 * marker, then restore everything in reverse.
 */
function renderLoopRow(
  host: LoopRenderHost,
  loop: IRLoop,
  supportableDestructure: boolean,
  param: string,
  rangeIndex: string,
  rangeValue: string,
): LoopRowRender {
  // Save/restore rather than plain assign: this loop's own body may contain
  // a NESTED loop that also flips `inLoop` true→false around itself. Without
  // saving, the inner loop's exit clobbers `inLoop` to `false` for the
  // remainder of THIS (outer) loop's body, so any outer-scope content
  // rendered after the nested loop wrongly takes the non-loop emission arms
  // (e.g. spread attrs resolve to the component-root slot mechanism instead
  // of the row-scoped field) (#2487).
  const wasInLoopOuter = host.inLoop()
  host.setInLoop(true)
  // Enter this loop's row scope (#2482 Stage 3). `IRLoop` already
  // structurally satisfies `LoopBindingSource`, so the plain/destructured
  // cases pass `loop` straight through — `enterLoopRow` binds
  // `paramBindings` (destructure) OR `param` (plain item) automatically.
  // `.keys()` is the one shape `BindingScope`'s generic 'item' semantics
  // don't fit: the callback param there IS the index, not the row value
  // (the dot context is the discarded value), so it must never win
  // `isCurrentLoopItem`'s dot-shortcut — enter with an overridden empty
  // `param`, mirroring the historical empty-string push onto the old
  // loop-param stack for the same shape. The key stays reachable only
  // via `loopVarRefCount`'s `$name` bookkeeping below, unchanged by this
  // migration.
  // The keys-shape param is the range *index*, so it binds as `index`: still
  // the nearest binding for a shadowed outer name (#3392), never the dot.
  // `rowType` types the row bindings (`renderLoopRowType`).
  const rowType = renderLoopRowType(host, loop)
  const scopeLoop: LoopBindingSource =
    loop.iterationShape === 'keys' ? { ...loop, param: '', index: loop.param } : { ...loop, rowType }
  const prevScope = host.scope()
  host.setScope(prevScope.enterLoopRow(scopeLoop))
  // Track Go template loop variables. The range *index* variable needs
  // `$name` notation and goes on `loopVarRefCount` (the range *value*
  // variable's dot-context resolution now comes from `scope` above).
  // Ref-counting (not a flat Set) keeps nested loops with the same index
  // var name from clobbering the outer entry on cleanup.
  const addedLoopVars: string[] = []
  // A `.map()` callback preamble lowers to one `{{$cls := …}}` per-row
  // variable per declaration (#2447). Registering the names on
  // `loopVarRefCount` is what makes `identifier()` resolve each read as
  // `$cls`; without it the read falls through to `rootFieldRef` and emits
  // `$.Cls` — a PARENT-struct field, never populated, which rendered the
  // attribute empty on every row (the same hoisted-to-parent class of
  // defect as #2445).
  for (const d of loop.preamble?.declarations ?? []) {
    host.loopVarRefCount().set(d.name, (host.loopVarRefCount().get(d.name) ?? 0) + 1)
    addedLoopVars.push(d.name)
  }
  const outerDestructureRangeVar = host.innermostDestructureRangeVar()
  host.setInnermostDestructureRangeVar(supportableDestructure ? rangeValue : null)
  const pushedBindingMap = bindLoopRowVars(host, loop, supportableDestructure, param, rangeIndex, rangeValue, addedLoopVars)
  // Tell the loop-body component renderer whether this is a scalar-item loop,
  // so its `bf_tmpl` companion is fed `.BfLoopItem` instead of `.`. Pushed
  // around the body render only; mirrors the wrapper/constructor
  // `wrapperRowScalarItemGoType` gate.
  host.loopScalarItemStack().push(isScalarItemLoop(host, loop))
  host.loopWrapperStack().push(!!loop.childComponent)
  const wasScalarWrapperRowCallSite = host.scalarWrapperRowCallSite()
  host.setScalarWrapperRowCallSite(host.ctx.state.scalarWrapperRowLoops.has(loop.markerId))
  // Rendered inside the pushed loop scope so each initializer resolves
  // against the range item (`.Done`), in source order so a later
  // initializer sees an earlier `$` variable — same as the source block.
  const preambleAssignments = (loop.preamble?.declarations ?? [])
    .map(d => `{{$${d.name} := ${host.renderParsedExpr(d.valueParsed)}}}`)
    .join('')
  const children = host.renderChildren(loop.children)
  host.setScalarWrapperRowCallSite(wasScalarWrapperRowCallSite)
  host.loopWrapperStack().pop()
  host.loopScalarItemStack().pop()
  // Build the per-item anchor marker while the row scope is still active,
  // so a `bodyIsItemConditional` key expression resolves against the
  // range item (`.` context) like `data-key` does — restoring first would
  // rewrite `t.id` to `.T.ID` instead of `.ID`.
  const itemMarker = loopItemMarker(host, loop)
  releaseLoopVars(host, addedLoopVars)
  host.setScope(prevScope)
  host.setInnermostDestructureRangeVar(outerDestructureRangeVar)
  if (pushedBindingMap) {
    host.loopBindingStack().pop()
    host.loopRestExcludeStack().pop()
  }
  host.setInLoop(wasInLoopOuter)
  return { rowType, preambleAssignments, children, itemMarker }
}

/**
 * Bind the loop row's range variables: a destructure param's accessors on the
 * synthetic range var, a `.keys()` param, or the plain range index. Returns
 * whether a destructure binding map was pushed.
 */
function bindLoopRowVars(
  host: LoopRenderHost,
  loop: IRLoop,
  supportableDestructure: boolean,
  param: string,
  rangeIndex: string,
  rangeValue: string,
  addedLoopVars: string[],
): boolean {
  if (supportableDestructure) {
    // Bindings resolve against the synthetic `$__bf_item` range var.
    const built = buildDestructureBindingMap(loop, rangeValue)
    host.loopBindingStack().push(built.bindings)
    const rowFrame = (loop.paramBindings ?? []).length > 0
      ? host.scope().lookup(loop.paramBindings![0].name)?.frame
      : undefined
    if (rowFrame) host.destructureAccessors().set(rowFrame, built.bindings)
    host.loopRestExcludeStack().push(built.restExcludes)
    if (rangeIndex !== '_') {
      host.loopVarRefCount().set(rangeIndex, (host.loopVarRefCount().get(rangeIndex) ?? 0) + 1)
      addedLoopVars.push(rangeIndex)
    }
    return true
  } else if (loop.iterationShape === 'keys') {
    host.loopVarRefCount().set(param, (host.loopVarRefCount().get(param) ?? 0) + 1)
    addedLoopVars.push(param)
  } else {
    if (rangeIndex !== '_') {
      host.loopVarRefCount().set(rangeIndex, (host.loopVarRefCount().get(rangeIndex) ?? 0) + 1)
      addedLoopVars.push(rangeIndex)
    }
  }
  return false
}

/** Release the ref-counted loop variables {@link renderLoopRow} registered. */
function releaseLoopVars(host: LoopRenderHost, addedLoopVars: readonly string[]): void {
  for (const v of addedLoopVars) {
    const rc = (host.loopVarRefCount().get(v) ?? 1) - 1
    if (rc <= 0) host.loopVarRefCount().delete(v)
    else host.loopVarRefCount().set(v, rc)
  }
}

/** `goArray` wrapped in the sort pipeline of a `.sort(cmp).map()` loop (see the comment in {@link renderLoop}). */
function sortedLoopArray(host: LoopRenderHost, sortComparator: NonNullable<IRLoop['sortComparator']>, goArray: string): string {
  const sortEmit = (e: ParsedExpr) => host.renderParsedExpr(e)
  const cmpArrow = sortComparator.arrow
  const body = cmpArrow.kind === 'arrow' ? cmpArrow.body : cmpArrow
  const params = cmpArrow.kind === 'arrow' ? cmpArrow.params : []
  const sorted =
    emitSortEval(goArray, body, params, sortEmit) ??
    emitBfSort(goArray, sortComparatorFromArrow(cmpArrow)!)
  return `(${sorted})`
}

/** The pieces of a `{{range}}` loop {@link renderFilteredLoop} assembles. */
interface FilteredLoopParts extends LoopRowRender {
  goArray: string
  rangeIndex: string
  rangeValue: string
  rowValueDecl: string
}

/** A `.filter().map()` loop: the row body gated on the predicate's `{{if}}`. */
function renderFilteredLoop(
  host: LoopRenderHost,
  loop: IRLoop,
  filterPredicate: NonNullable<IRLoop['filterPredicate']>,
  { goArray, rangeIndex, rangeValue, rowValueDecl, rowType, preambleAssignments, itemMarker, children }: FilteredLoopParts,
): string {
  const captureAliases = new Map<string, string>()

  const filterCond = filterCondition(host, loop, filterPredicate, rangeValue, rangeIndex, rowType, captureAliases)
  const captureDecls = [...captureAliases].map(([name, alias]) => `{{$${alias} := ${host.rowVarRef(name)}}}`).join('')

  // The preamble assignments sit INSIDE the `{{if}}`, matching JS
  // evaluation order: a `.filter(p).map(cb)` chain never runs `cb`'s
  // body for a filtered-out item.
  return `{{bfComment "loop:${loop.markerId}"}}${captureDecls}{{range $${rangeIndex}, $${rangeValue} := ${goArray}}}${rowValueDecl}{{if ${filterCond}}}${preambleAssignments}${itemMarker}${children}{{end}}{{end}}{{bfComment "/loop:${loop.markerId}"}}`
}

/**
 * The `{{if}}` condition of a `.filter().map()` loop. Fills `captureAliases`
 * with the enclosing range variables the predicate reads (#3396).
 */
function filterCondition(
  host: LoopRenderHost,
  loop: IRLoop,
  filterPredicate: NonNullable<IRLoop['filterPredicate']>,
  rangeValue: string,
  rangeIndex: string,
  rowType: TypeInfo | null,
  captureAliases: Map<string, string>,
): string {
  let filterCond: string
  if (filterPredicate.predicate) {
    // #2228: for a wrapper-slice loop (`.TodoItems` ranging over
    // TodoItemProps), `.` in the predicate is the WHOLE wrapper struct —
    // qualify `loop.filterPredicate.param` references through the
    // datum-carrying field (`.Todo.Done`, not `.Done`) so the emitted
    // `{{if}}` only ever dereferences fields the wrapper struct actually
    // has. `wrapperDatumField` returns `null` for a plain-element-body
    // loop, where `.` already IS the datum — `renderPredicateCondition`
    // then keeps emitting the bare `.`/`.Field` form unchanged.
    const datumField = wrapperDatumField(host, loop)
    // The predicate runs inside this loop's own `{{range}}`, whose
    // `$item`/`$index` would shadow an enclosing `$name` the predicate
    // captures (`.filter(t => t === name).map(name => …)`). Keep each such
    // enclosing value under a loop-scoped variable declared before the
    // range, and read that in the predicate (#3396).
    for (const declared of [rangeValue, rangeIndex]) {
      if (declared === '_' || host.filterCaptureAliases().has(declared)) continue
      if (host.lookupDestructureBinding(declared) !== undefined) continue
      if (host.isOuterRowItem(declared) || host.loopVarRefCount().has(declared)) {
        captureAliases.set(declared, `__bf_cap_${loop.markerId}_${declared}`)
      }
    }
    const prevAliases = host.filterCaptureAliases()
    host.setFilterCaptureAliases(new Map([...prevAliases, ...captureAliases]))
    try {
      filterCond = renderPredicateCondition(
        host,
        filterPredicate.predicate,
        filterPredicate.param,
        datumField,
        isFieldlessLoopRow(host, loop, rowType),
      )
    } finally {
      host.setFilterCaptureAliases(prevAliases)
    }
  } else {
    // Phase 1 always attaches the predicate; a missing one is refused,
    // never stood in for by a truthy constant that renders every row (#3534).
    const refusal = missingFilterPredicateRefusal(filterPredicate.raw, 'Go template')
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: refusal.message,
      loc: host.makeLoc(),
      suggestion: { message: refusal.suggestion },
    })
    filterCond = 'true'
  }
  return filterCond
}

/**
 * Whether `loop`'s destructure param lowers to Go accessors; refuses one that
 * doesn't with BF104 (see the comment below).
 */
function checkLoopDestructure(host: LoopRenderHost, loop: IRLoop): boolean {
  // An array/object-destructure loop param (`([emoji, users]) => ...` or
  // `({ name, age }) => ...`) requires multi-variable `{{range $k, $v := ...}}`
  // semantics that Go templates don't provide for arbitrary tuples — the
  // adapter would otherwise emit `{{range $_, $[emoji, users] := .Entries}}`,
  // invalid Go template syntax. Surface this at build time instead of shipping
  // a broken `{{range}}` line.
  //
  // Check the IR's structured `paramBindings` field rather than string-matching
  // `loop.param`: Phase 1 populates it iff the param is a destructure pattern,
  // and the structured check is robust to formatting variants. `isLowerableLoopDestructure`
  // (#2087 Phase A/B) admits fixed bindings at ANY depth (`.field`, array-index,
  // nested combinations of either — `buildSegmentAccessor` walks the structured
  // `segments` path), array-rest (`[a, ...t]` → `bf_slice`), and object-rest
  // whose every use is a member read (`rest.flag`) or a `{...rest}` spread onto
  // an intrinsic element (→ `bf_omit`, see `emitSpread`). Still refused (BF104):
  // a bare-value object-rest use (`String(rest)`, `{rest}`, spread onto a
  // component), and a `.filter().map(destructure)` chain — those need either the
  // actual residual object or a filter-param retarget this lowering doesn't do.
  const destructure = !!(loop.paramBindings && loop.paramBindings.length > 0)
  const supportableDestructure = destructure && isLowerableLoopDestructure(loop)
  if (destructure && !supportableDestructure) {
    host.ctx.state.errors.push({
      code: 'BF104',
      severity: 'error',
      message: `Loop callback uses an array/object destructure pattern (\`${loop.param}\`) that the Go template adapter cannot lower — Go's \`{{range}}\` only supports single-name bindings.`,
      loc: loop.loc ?? host.makeLoc(),
      suggestion: {
        message:
          `Options:\n` +
          `  1. Rename the parameter to a single name and access tuple elements with index syntax in the body (e.g. \`entry => entry[0]\` instead of \`([k, v]) => ...\`).\n` +
          `  2. Mark the loop position as @client-only so the destructure runs in JS on the client.\n` +
          `  3. Move the loop into a primitive that the adapter registers explicitly.`,
      },
    })
  }
  return supportableDestructure
}

/**
 * #2224 shape 1: render a static-array, plain-element-body loop's per-item
 * markup ONCE PER ITEM at template-generation time instead of a Go
 * `{{range}}` — `analyzeBakeableStaticElementLoop` has already verified
 * every expression in `loop.children` resolves against each item. Keeps
 * the SAME `<!--bf-loop:id--> ... <!--/bf-loop:id-->` marker pair a
 * dynamic loop emits (so the CSR-side static `forEach` wiring, compiled by
 * the separate `ir-to-client-js.ts` pass and untouched by this change,
 * still finds the same DOM range), and pushes `loop.param` /
 * `loop.depth` onto the SAME stacks `renderLoop`'s `{{range}}` path uses,
 * so `data-key`/`data-key-N` attribute-name derivation
 * (`renderAttributes`) is unaffected by which path rendered the loop. No
 * `itemMarker` (`loopItemMarker`) call: the analysis gate already refused
 * `bodyIsMultiRoot` / `bodyIsItemConditional` bodies, so it would always
 * return `''` here anyway.
 */
function renderUnrolledStaticElementLoop(host: LoopRenderHost, loop: IRLoop, items: readonly unknown[]): string {
  // Save/restore, not a plain assign — see the matching comment in
  // `renderLoop` (#2487): a nested loop inside this unrolled body must not
  // clobber `inLoop` for the remainder of an outer loop's rendering.
  const wasInLoopOuter = host.inLoop()
  host.setInLoop(true)
  host.loopWrapperStack().push(false)
  host.loopScalarItemStack().push(host.scalarLiteralLoopGoType(loop.arrayParsed, loop.itemType) !== null)
  // The bake gate (`analyzeBakeableStaticElementLoop`) already refused a
  // destructured or `.keys()`-shape param, so `loop` binds via `enterLoopRow`
  // unadjusted — always a plain item (#2482 Stage 3).
  const prevScope = host.scope()
  host.setScope(prevScope.enterLoopRow({ ...loop, rowType: loopRowType(host.ctx, loop, prevScope) }))

  let body = ''
  for (const item of items) {
    host.staticLoopItemStack().push({ param: loop.param, item })
    body += host.renderChildren(loop.children)
    host.staticLoopItemStack().pop()
    if (host.staticLoopBakeFailed()) {
      // Invariant violation (see `staticLoopBakeFailed`'s docstring): the
      // gate and this render pass disagreed. Surface it loudly instead of
      // shipping a template with `""` sentinels silently spliced in.
      host.setStaticLoopBakeFailed(false)
      host.ctx.state.errors.push({
        code: 'BF101',
        severity: 'error',
        message: `Loop array \`${loop.array.trim()}\` could not be fully unrolled — an expression in the loop body did not resolve against every item as the compile-time analysis expected.`,
        loc: loop.loc ?? host.makeLoc(),
        suggestion: {
          message: 'This indicates a bug in the Go adapter\'s static-loop unrolling (#2224) rather than an unsupported source pattern; please file a bug with a reproduction.',
        },
      })
      break
    }
  }

  host.setScope(prevScope)
  host.loopScalarItemStack().pop()
  host.loopWrapperStack().pop()
  host.setInLoop(wasInLoopOuter)

  return `{{bfComment "loop:${loop.markerId}"}}${body}{{bfComment "/loop:${loop.markerId}"}}`
}

/**
 * Per-item `<!--bf-loop-i-->` / `<!--bf-loop-i:KEY-->` start marker emitted
 * inside a `{{range}}` body. Multi-root Fragment items get the bare anchor;
 * whole-item conditional items get the key-bearing anchor so the client's
 * `mapArrayAnchored` can hydrate items that render no element.
 */
function loopItemMarker(host: LoopRenderHost, loop: { bodyIsMultiRoot?: boolean; bodyIsItemConditional?: boolean; key?: string | null }): string {
  // `bfComment` prepends `bf-`, so the argument is `"loop-i"`, not
  // `"bf-loop-i"` (which would double the prefix to `<!--bf-bf-loop-i-->`
  // — the same latent bug #2763's fixture caught on the Hono adapter).
  if (loop.bodyIsMultiRoot) return `{{bfComment "loop-i"}}`
  if (loop.bodyIsItemConditional && loop.key) {
    // `bfComment` prepends `bf-`, so `printf "loop-i:%v"` yields
    // `<!--bf-loop-i:KEY-->`. The key expression resolves against the current
    // range item (`.` context), matching `data-key`'s emission.
    // `bfEscapeCommentKey` (#2795 follow-up) neutralizes `-` so a key can't
    // spell `-->` and close the comment early — see its doc in `bf.go`.
    return `{{bfComment (printf "loop-i:%v" (bfEscapeCommentKey ${host.ctx.convertExpressionToGo(loop.key)}))}}`
  }
  return ''
}

/**
 * On a scalar wrapper row (`scalarWrapperRowLoops`) the range variable
 * holds the row wrapper; rebind it to the bare value (`.BfLoopItem`) at the
 * top of the row, so a `$g` read anywhere in the calling template — a
 * nested callback in the filter predicate, a preamble local — sees the
 * value, as `currentLoopItemRef` does for the dot.
 */
function scalarWrapperRowValueDecl(host: LoopRenderHost, loop: IRLoop, rangeValue: string): string {
  if (rangeValue === '_' || !host.ctx.state.scalarWrapperRowLoops.has(loop.markerId)) return ''
  return `{{$${rangeValue} := .${SCALAR_ROW_ITEM_FIELD}}}`
}

/** A loop over a primitive-literal array, or a scalar wrapper row (`scalarWrapperRowLoops`). */
function isScalarItemLoop(host: LoopRenderHost, loop: IRLoop): boolean {
  return host.scalarLiteralLoopGoType(loop.arrayParsed, loop.itemType) !== null || host.ctx.state.scalarWrapperRowLoops.has(loop.markerId)
}

/**
 * The type a rendered loop's row bindings carry: Phase 1's scalar
 * `itemType` (the callback param's checked type) when present, else the
 * array's declared element type (`loopRowType`), so a text sink can tell a
 * string row field from a number (`isKnownNonNumber`). The scalar answer
 * wins because a declared element type the adapter can't read
 * (`(string | null)[]`) would otherwise hide that the row is a scalar with
 * no fields (`isFieldlessRowType`).
 */
function renderLoopRowType(host: LoopRenderHost, loop: IRLoop): TypeInfo | null {
  return loop.itemType ?? loopRowType(host.ctx, loop, host.scope())
}

/**
 * The loop's row value has no fields: a scalar wrapper row
 * (`scalarWrapperRowLoops`), or a row typed as a scalar
 * (`isFieldlessRowType` of `rowType`, as the row's scope binding is
 * typed). A fused filter predicate's `w.length` then reads the value, not
 * a `.Length` field.
 */
function isFieldlessLoopRow(host: LoopRenderHost, loop: IRLoop, rowType: TypeInfo | null): boolean {
  return host.ctx.state.scalarWrapperRowLoops.has(loop.markerId) || isFieldlessRowType(rowType)
}

/**
 * #2228: the Go field name on the wrapper Props struct that carries the
 * loop datum, for a loop whose body IS a child component (`loop.childComponent`,
 * e.g. `.TodoItems` ranging over `TodoItemProps`). `{{range}}`'s dot context
 * for such a loop is the WHOLE wrapper struct (`TodoItemProps{ Todo Todo,
 * OnToggle ..., ... }`), not the raw per-item datum — so a filter predicate
 * (`t => !t.done`) referencing the loop param can't lower `t.done` straight
 * to `.Done` (no such top-level field; `html/template` fails at execute time
 * with `can't evaluate field Done in type TodoItemProps`). The datum lives
 * nested under whichever child prop was PASSED the loop param verbatim
 * (`todo={todo}` → field `Todo`, from `capitalizeFieldName('todo')` — the
 * SAME derivation `generateInputStruct`/`generatePropsStruct` use for every
 * other prop-to-field mapping, so this never invents a field name the
 * generated struct doesn't actually have). Returns `null` for a non-wrapper
 * loop, or when no prop's value is a bare reference to the loop param (the
 * datum isn't forwarded at all — nothing to qualify through).
 */
function wrapperDatumField(host: LoopRenderHost, loop: {
  childComponent?: IRLoopChildComponent
  param: string
  markerId: string
}): string | null {
  if (!loop.childComponent) return null
  // A scalar wrapper row carries the bare value itself (`scalarWrapperRowLoops`).
  if (host.ctx.state.scalarWrapperRowLoops.has(loop.markerId)) return SCALAR_ROW_ITEM_FIELD
  for (const prop of loop.childComponent.props) {
    if (prop.isEventHandler) continue
    if (prop.value.kind !== 'expression') continue
    const parsed = prop.value.parsed
    const isBareParamRef = parsed
      ? parsed.kind === 'identifier' && parsed.name === loop.param
      : prop.value.expr.trim() === loop.param
    if (isBareParamRef) return capitalizeFieldName(prop.name)
  }
  return null
}

/**
 * Render a predicate for use in Go template `{{if}}` conditions, substituting
 * the loop parameter (e.g. `t` in `t.done`) with dot notation. `datumField`
 * (#2228) is the wrapper struct's datum-carrying field name (e.g. `"Todo"`)
 * for a loop whose body is a child component — see `wrapperDatumField` — so
 * `t.done` qualifies through it (`.Todo.Done`) instead of the bare `.Done`
 * `html/template` can't resolve on the wrapper Props struct. `undefined` for
 * a non-wrapper (plain-element-body) loop, where `.` already IS the datum.
 */
function renderPredicateCondition(host: LoopRenderHost, pred: ParsedExpr, param: string, datumField?: string | null, fieldlessParam = false): string {
  return renderFilterExpr(host.conditionExprHost, pred, param, new Map(), datumField ?? undefined, fieldlessParam) ?? 'false'
}

/**
 * Map each destructure binding to its Go accessor on the range var (#2087
 * Phase B — `isLowerableLoopDestructure` admits every shape below):
 *
 *   - fixed binding (any depth): the FULL `segments` path over the range var
 *     (`id` → `$item.Id`, `head` in `cells: [head]` → `(index $item.Cells 0)`,
 *     `k` in `[k, v]` → `(index $item 0)`).
 *   - array-rest (`[first, ...tail]`): the PARENT `segments` prefix wrapped in
 *     `bf_slice` (`tail` → `(bf_slice $item 1)`) — this IS the binding's whole
 *     value, so it composes correctly both bare and under `.length` (`len
 *     (bf_slice $item 1)`, via the `member()` emitter's generic `len <obj>`
 *     arm).
 *   - object-rest (`{ id, ...rest }`): the bare PARENT accessor, so a member
 *     read (`rest.flag`) renders `$item.Flag` — the simplest lowering that
 *     keeps the already-green `rest-destructure-object-in-map` fixture byte-
 *     exact. A `{...rest}` SPREAD needs the residual (item minus the
 *     destructured siblings), which this map alone can't express; that case
 *     is tracked separately in the returned `restExcludes` map and consumed
 *     by `emitSpread`'s `bf_omit` lowering, not through this binding value.
 */
function buildDestructureBindingMap(
  loop: IRLoop,
  rangeVar: string,
): {
  bindings: Map<string, string>
  restExcludes: Map<string, { parent: string; excludeKeys: string[] }>
} {
  const bindings = new Map<string, string>()
  const restExcludes = new Map<string, { parent: string; excludeKeys: string[] }>()
  const base = `$${rangeVar}`
  for (const b of loop.paramBindings ?? []) {
    const parent = buildSegmentAccessor(base, b.segments ?? [])
    if (!b.rest) {
      bindings.set(b.name, parent)
    } else if (b.rest.kind === 'array') {
      bindings.set(b.name, `(bf_slice ${parent} ${b.rest.from})`)
    } else {
      bindings.set(b.name, parent)
      restExcludes.set(b.name, { parent, excludeKeys: b.rest.exclude.map(k => k.key) })
    }
  }
  return { bindings, restExcludes }
}

/**
 * Walk a destructure binding's structured `segments` path (#2087 Phase A) into
 * a Go accessor over `base`. A `field` step appends `.<GoFieldName>` — dot
 * access resolves against a struct field OR a map key (Go template's
 * `evalField` supports both), and `goFieldNameForKey` produces a valid Go
 * identifier regardless of whether the SOURCE key was one (`cells` → `Cells`,
 * `data-priority` → `DataPriority`) — Go dot-syntax only requires the EMITTED
 * name to be a legal identifier, not the original JS key. An `index` step
 * has no dot-notation form, so it wraps in Go's `index` builtin
 * (`(index <acc> N)`); the wrap also parenthesises the whole accessor so a
 * following step or an outer composition (`len (...)`) can't swallow it as
 * extra call arguments.
 */
function buildSegmentAccessor(base: string, segments: readonly LoopBindingPathSegment[]): string {
  let acc = base
  for (const seg of segments) {
    acc = seg.kind === 'field' ? `${acc}.${goFieldNameForKey(seg.key)}` : `(index ${acc} ${seg.index})`
  }
  return acc
}

/**
 * Whether `name` reads the innermost enclosing loop's own row: its item
 * param, or a name destructured from it (#3313). Either is a field of the
 * row wrapper a forwarded-children define receives as its data.
 */
function isInnermostRowBinding(host: LoopRenderHost, name: string): boolean {
  const hit = host.scope().lookup(name)
  return hit !== null && hit.depth === 0 && (hit.binding.source === 'item' || hit.binding.source === 'destructure')
}

/**
 * #2445: per-row Go pipeline arguments for a child component nested inside
 * a COMPOSITE loop row (row root is a plain element — `<li><Badge
 * text={row.label}/></li>` — as opposed to the wrapper-slice case where the
 * loop body IS the component). `collectStaticChildInstancesRecursive`
 * registers such a child as an ordinary once-per-slot instance
 * (`$.<Name>SlotN`), built ONCE outside `{{range}}` by
 * `emitStaticChildInstances` — correct for props that don't depend on the
 * row, but stale for one that does (`text={row.label}` reads the same
 * value on every row). A loop-dependent prop is therefore re-applied per
 * row, at template-execution time, via the `bf_with_props` runtime helper
 * (the props-argument sibling of `bf_with_children`, which already does
 * this for per-row JSX children on the same shared instance).
 *
 * A prop with no loop-bound free identifier (`IRProp.freeIdentifiers`, IR-
 * build-time computed, #1267) is left on the constructor path — it's
 * already correct there, and skipping it keeps every currently-passing
 * fixture's emitted template byte-identical (no fixture in the corpus
 * reaches this method with a loop-dependent prop today).
 *
 * #2448 — `bf_with_props` overrides fields on the ALREADY-CONSTRUCTED
 * shared instance; it does not re-run `New<Child>Props`. A field the child
 * derives FROM the overridden prop at construction time (a memo body or a
 * signal's initial value) would keep whatever the one-shot constructor
 * computed and never update per row. Two outcomes, decided per child:
 *
 * - The child has a generated props rebuilder (`childRepropsReady`): the
 *   caller emits `bf_reprops` instead, which re-runs the real constructor
 *   per row so every derived field recomputes. Nothing is refused.
 * - It does not (its Input can't be reconstructed from Props — see
 *   `generateRepropsRegistration`'s eligibility gate): BF101 + `continue`,
 *   exactly like the unsupported-expression refusal a few lines below.
 *   Refusing beats emitting silently-stale output.
 *
 * #2457 — the `"Field"` half of each argument pair is the child's OWN Go
 * field name (resolved through `childPropFieldNames`), not the JSX
 * attribute name. For an un-aliased prop those are the same string; for an
 * aliased destructure (`{ n: count }`) the child's field is `Count` while
 * the JSX attribute is `n`, and emitting the attribute name left
 * `bf.WithProps`/`bf.RepropsAssign` with a name the struct has no field
 * for — silently dropped by the former, an unknown-field error from the
 * latter. Resolving it here, once, means both helpers only ever see a name
 * the struct actually has.
 *
 * Returns the space-joined `"Field" value …` argument list plus the helper
 * the caller must wrap it in, or null when nothing needs overriding (caller
 * keeps the bare `$.<Name>SlotN` reference).
 */
export function loopRowChildPropOverrides(
  host: LoopRenderHost,
  comp: IRComponent,
  rowItemOnly = false,
): {
  args: string | null
  helper: 'bf_with_props' | 'bf_reprops'
  bagEntries: Array<{ bagField: string; key: string; go: string }>
} | null {
  // #2822: every cross-file map below is keyed by the child's own
  // declared name, not the caller-local alias — see `importAliases`.
  // Diagnostics still name `comp.name` (what the user actually wrote in
  // the JSX) since that's the more useful reference for the reader.
  const declaredName = host.resolveChildName(comp.name)
  const childShape = host.childShape(declaredName)
  const args: string[] = []
  const bagEntries: Array<{ bagField: string; key: string; go: string }> = []
  // Set by the derived-field check below when at least one overridden prop
  // feeds a constructor-derived field AND the child can rebuild itself.
  let needsRebuild = false
  for (const prop of comp.props) {
    const lowered = lowerLoopRowChildProp(host, comp, prop, declaredName, childShape, rowItemOnly, bagEntries)
    if (lowered === null) continue
    if (lowered.rebuild) needsRebuild = true
    args.push(lowered.arg)
  }
  if (args.length === 0 && bagEntries.length === 0) return null
  return {
    args: args.length > 0 ? args.join(' ') : null,
    helper: needsRebuild ? 'bf_reprops' : 'bf_with_props',
    bagEntries,
  }
}

/**
 * One prop of {@link loopRowChildPropOverrides}: its `"Field" value` argument
 * and whether it needs the rebuilder, or null when the prop is not overridden
 * per row (skipped, refused, or routed into `bagEntries`).
 */
function lowerLoopRowChildProp(
  host: LoopRenderHost,
  comp: IRComponent,
  prop: IRProp,
  declaredName: string,
  childShape: ChildComponentShape | undefined,
  rowItemOnly: boolean,
  bagEntries: Array<{ bagField: string; key: string; go: string }>,
): { arg: string; rebuild: boolean } | null {
  // `key`/`children` aren't Props-struct fields; event handlers have no
  // Go field (`isEventHandlerName`); a hyphenated name can't be a Go
  // field (same guard as `emitChildField`). A `/* @client *\/` prop is
  // delivered like any other when it lowers — the reference renders it
  // at SSR — and, being the escape, is skipped silently when it doesn't
  // (every refusal below checks `escaped`).
  const escaped = !!prop.clientOnly
  if (prop.name === 'key' || prop.name === 'children') return null
  if (isEventHandlerName(prop.name)) return null
  if (prop.name.includes('-')) return null
  // A prop that routes into the child's rest bag (`routesToRestBag`,
  // `emitChildField`'s same routing rule) has no named Go field to
  // override via `bf_with_props` — routed into `bagEntries` below instead
  // (#3062), the loop-row delivery `queueDynamicPropDefine`'s static
  // sibling route (#2805, `bf_with_bag`) didn't reach yet.
  const isRestBag = routesToRestBag(childShape, prop.name)
  // `literal` / `boolean-shorthand` / `boolean-attr` carry no runtime
  // expression to re-evaluate per row; `spread` / `jsx-children` are
  // handled elsewhere (`emitSpreadBagInits`, `queueLoopBodyChildrenDefine`).
  if (prop.value.kind !== 'expression') return null
  const free = prop.freeIdentifiers
  if (!free || ![...free].some(name => host.isLoopShadowedName(name))) return null
  let rebuild = false
  // `rowItemOnly` (a wrapper-slice row's forwarded-children define): the
  // define runs as its own template with the row wrapper as its data, so
  // only the innermost row's fields (`.Field`, or a name destructured
  // from the row) are reachable there.
  // An outer row's binding is a `{{range}}` variable of the calling
  // template the define can't see — such a prop keeps the shared
  // instance's value.
  // The calling loop's index and callback locals ARE reachable when the
  // define rebinds them from the wrapper's `BfRowVars` (`wrapperRowVars`;
  // a scalar row's define has no wrapper to carry them) — but only for a
  // prop that reads nothing else: the row wrapper has no field for the
  // parent's state, so `checked={selected()[index]}` (the data-table
  // selection demo) would read a field the define's data lacks.
  if (rowItemOnly && isUnreachableFromRowDefine(host, free)) return null
  // #2448's derived-field staleness check only applies to a NAMED FIELD
  // override — `bf_with_props` patches struct fields the constructor may
  // derive OTHER fields from. A rest-bag entry is an opaque
  // `map[string]any` value nothing derives from, so it never needs a
  // rebuild and skips this check entirely.
  if (!isRestBag) {
    const staleRebuild = derivedFieldRebuild(host, comp, prop, declaredName, escaped)
    if (staleRebuild === null) return null
    // Claimed below, once the prop's value has actually lowered.
    rebuild = staleRebuild
  }
  const go = lowerOverrideValue(host, comp, prop, prop.value, escaped)
  if (go === null) return null
  // #3062: a rest-bag prop has no declared field — deliver its per-row
  // value through `bf_with_bag` (keyed by the RAW JSX attribute name,
  // same as `queueDynamicPropDefine`'s static sibling route) instead of
  // a `bf_with_props` field-name pair. Synced onto EVERY render-consulted
  // bag field (`restBagOverrideFields` — `Rest` for a `rest.x` member
  // read, plus any `Spread_N` an element spread of the same binding
  // renders from), not just `restBagField`, or the override lands on a
  // field the child's render never reads (#3062's actual failure mode).
  if (isRestBag) {
    const wrapped = wrapIfMultiToken(go)
    for (const bagField of restBagOverrideFields(childShape)) {
      bagEntries.push({ bagField, key: prop.name, go: wrapped })
    }
    return null
  }
  // Emit the CHILD's own PROPS field name, not the JSX attribute name —
  // `bf.WithProps`/`bf.RepropsAssign` patch the constructed PROPS
  // instance, and passing a name the struct doesn't have (an aliased
  // `{ n: count }` attribute) is a silent passthrough, not an error
  // (#2457). Stays LOCAL even though the child's Input field is
  // caller-facing. Falls back to the capitalized attribute for a
  // cross-file child this run's pre-pass never registered.
  const fieldName = host.childPropFieldName(declaredName, prop.name) ?? capitalizeFieldName(prop.name)
  if (rebuild) {
    // The rebuilder is emitted into THIS component's type block, not the
    // child's — only here do we know it is actually needed. First parent
    // to claim a child owns the registration, so two parents overriding
    // the same child don't both emit an `init()` for it. Keyed by the
    // child's DECLARED name (#2822) — `emitRepropsRegistration` below
    // builds Go type references (`<Name>Props`/`<Name>Input`) from this
    // same key, and only the declared name has real types to match.
    if (!host.repropsOwner().has(declaredName)) {
      host.repropsOwner().set(declaredName, host.ctx.state.componentName)
    }
  }
  return { arg: `${JSON.stringify(fieldName)} ${wrapIfMultiToken(go)}`, rebuild }
}

/**
 * Whether a prop reading `free` can't be re-applied inside a wrapper-slice
 * row's forwarded-children define (see the comment at the call site).
 */
function isUnreachableFromRowDefine(host: LoopRenderHost, free: ReadonlySet<string>): boolean {
  const rowVars = host.wrapperRowVarNames()
  const reachable = (name: string): boolean => isInnermostRowBinding(host, name) || !!rowVars?.has(name)
  const unreachable = [...free].some(name => host.isLoopShadowedName(name) && !reachable(name))
  const readsRowVar = [...free].some(name => !isInnermostRowBinding(host, name) && !!rowVars?.has(name))
  return unreachable || (readsRowVar && ![...free].every(reachable))
}

/**
 * #2448: whether overriding `prop` needs the child's rebuilder because a
 * constructor-derived field reads it, or null when that staleness is refused
 * (or skipped for a `@client` prop).
 */
function derivedFieldRebuild(
  host: LoopRenderHost,
  comp: IRComponent,
  prop: IRProp,
  declaredName: string,
  escaped: boolean,
): boolean | null {
  const derived = host.childDerivedFieldDeps(declaredName)
  const overriddenField = capitalizeFieldName(prop.name)
  const staleField = derived
    ? [...derived].find(([, deps]) => deps.has(overriddenField))?.[0]
    : undefined
  if (staleField && !host.childRepropsReady(declaredName)) {
    if (escaped) return null
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Prop '${prop.name}' on <${comp.name}> nested inside a dynamic loop row is overridden per row, but <${comp.name}>'s '${staleField}' field is computed from '${prop.name}' when the shared instance is first constructed and won't recompute per row — it would keep the first row's value on every row.`,
      loc: prop.loc,
      suggestion: {
        message: `Mark this loop position '@client' to render <${comp.name}> client-side, or compute '${staleField}' in the parent and pass it to <${comp.name}> as a plain prop instead of deriving it inside <${comp.name}>.`,
      },
    })
    return null
  }
  return !!staleField
}

/**
 * The per-row Go pipeline argument for `prop`'s value, or null when it doesn't
 * lower (refused, or skipped for a `@client` prop).
 */
function lowerOverrideValue(
  host: LoopRenderHost,
  comp: IRComponent,
  prop: IRProp,
  value: Extract<IRProp['value'], { kind: 'expression' }>,
  escaped: boolean,
): string | null {
  const exprOut: { parsed?: ParsedExpr } = {}
  const errorCountBefore = host.ctx.state.errors.length
  let go = host.ctx.convertExpressionToGo(value.expr, exprOut, value.parsed)
  if (host.ctx.state.errors.length > errorCountBefore) {
    if (escaped) {
      host.ctx.state.errors.length = errorCountBefore
      return null
    }
    // `convertExpressionToGo` already pushed its own BF101 for an
    // unsupported expression and returned the `""` sentinel — using it
    // here would silently clobber the field with an empty string (or,
    // for a non-string field, fail at template EXECUTE time instead of
    // this compile time). Leave the prop on the constructor path; the
    // reported error already surfaces the real problem. `loc` defaults
    // to `convertExpressionToGo`'s own `this.makeLoc()` placeholder —
    // repoint the newly-pushed error(s) at the prop's real source
    // location, same as the fragment-refusal error below.
    for (let i = errorCountBefore; i < host.ctx.state.errors.length; i++) {
      host.ctx.state.errors[i].loc = prop.loc
    }
    return null
  }
  // A ternary or template literal (`row.on ? "yes" : "no"`, `` `#${row.id}
  // ${row.label}` ``) in this ARGUMENT position (a `bf_with_props`/
  // `bf_reprops` value, not a text position) must lower through the
  // shared value-operand door (#2863/#2335) — `convertExpressionToGo`'s
  // generic path returns `templateLiteral()`'s TEXT-position mixed
  // literal-text-plus-`{{…}}`-actions form for a template literal, which
  // is not a legal bare pipeline argument (multi-part) or needed an
  // ad-hoc single-part unwrap here (this replaces both). Recompute from
  // the already-validated `exprOut.parsed` tree rather than trying to
  // unwrap or refuse the text-position string after the fact.
  if (exprOut.parsed?.kind === 'template-literal' || exprOut.parsed?.kind === 'conditional') {
    go = lowerValueOperand(host.ctx, exprOut.parsed)
  } else if (host.isTemplateFragment(go, exprOut.parsed?.kind)) {
    // A genuine `{{if}}...{{end}}`-shaped (or other `{{`-leading action)
    // fragment can't be a bare pipeline argument — refuse loudly rather
    // than silently dropping the prop (the #2445 bug was exactly a
    // silent drop one level up).
    if (escaped) return null
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: `Prop '${prop.name}' on <${comp.name}> nested inside a dynamic loop row reads the row but can't be lowered to a Go template pipeline argument`,
      loc: prop.loc,
    })
    return null
  }
  return go
}
