/**
 * The decisions behind a DSL adapter's `renderLoop` (#3473), as data.
 *
 * Every DSL adapter decides the same things about a `.map()` loop before it
 * spells a line of template: whether its destructure pattern lowers (BF104),
 * whether the source is a static literal, whether it names a computed const
 * no template binds (BF101), how its `.sort` comparator lowers, which filter
 * captures need an alias, how the filter predicate reads on the row, and
 * which locals the row binds for its index and its destructure bindings.
 * {@link planLoop} makes those decisions once, against the scope outside the
 * loop; {@link savedLoopBindings} decides, against the row's scope, which
 * row bindings a backend without loop-scoped `set` saves and restores. The adapter keeps the spelling:
 * the loop header, the row bindings, the diagnostics' wording, and the order
 * it emits them in.
 */

import { type ParsedExpr, parseExpression, renameFreeIdentifiers, type SortComparator } from '../expression-parser.ts'
import { isLowerableLoopDestructure } from '../loop-destructure.ts'
import type { BindingScope, ScopeBindingSource } from '../scope/binding-scope.ts'
import { resolveStaticLoopSource } from '../static-literal.ts'
import type { ConstantInfo, IRLoop, LoopBindingPathSegment } from '../types.ts'
import {
  type CallbackEvalSpelling,
  type CallbackLoweringOptions,
  emitCallbackEval,
  lowerSortComparator,
  missingFilterPredicateRefusal,
  type SortPlan,
} from './callback-method.ts'
import { filterCaptureCollisions } from './filter-capture-collisions.ts'

export interface LoopPlanContext<Spelled> {
  /** The scope outside the loop. */
  scope: BindingScope
  localConstants: readonly ConstantInfo[]
  /** The adapter's literal-const resolution: a literal const inlines at its use site. */
  resolveLiteralConst(name: string): unknown
  callbackLowering: CallbackLoweringOptions
  /** The adapter's spelling of a static source's items, or `null` when the backend cannot represent one. */
  spellStatic(items: unknown[]): Spelled | null
}

export interface LoopPlan<Spelled> {
  /**
   * The loop param's destructure pattern: none, one the adapter lowers to
   * per-binding accessors, or one no template binds (BF104).
   */
  destructure: 'none' | 'lowerable' | 'unlowerable'
  /**
   * The source spelled as a template literal, when it is an inline literal or
   * an unshadowed static const whose items the backend can represent.
   */
  staticSource: Spelled | null
  /**
   * The const the source names when it is not spelled statically and no
   * template binds it as a literal (BF101). A loop binding that shadows the
   * name is the row's value, not the const (#3473).
   */
  unresolvableConst: ConstantInfo | null
  /**
   * The `.sort` / `.toSorted` comparator's lowering, or `null` without one:
   * the evaluator, the structured `{keys: …}` descriptor, or BF101, the same
   * chain as `.sort(cmp)` at an expression position.
   */
  sort: SortPlan | null
  /** The filter predicate's captures that a row binding would shadow, each with its alias. */
  captureAliases: Array<{ name: string; alias: string }>
  /** The `.filter()` predicate of a `.filter().map()` loop, or `null` without one. */
  filter: LoopFilterPlan | null
  /**
   * The for-target of an array iteration: the param itself, or the synthetic
   * `__bf_item` when the param is not the item (a `.keys()` iteration, whose
   * param is the index, or a lowered destructure, whose bindings read off it).
   */
  itemVar: string
  /**
   * The name a local binds to the row's 0-based index in an array iteration:
   * a `.keys()` iteration's param, else the explicit index param. `null` for
   * an object iteration, whose key the header binds.
   */
  indexLocal: string | null
  /** One local per binding of a lowered destructure, in pattern order. */
  destructureLocals: Array<{ name: string; value: DestructureValue }>
}

/**
 * What a lowered destructure binding reads off the row item: the value at
 * `segments`, or for a rest binding the residual of the value there (the
 * array from `from` on, or the object without the `exclude` keys).
 */
export type DestructureValue =
  | { kind: 'path'; segments: readonly LoopBindingPathSegment[] }
  | { kind: 'slice'; segments: readonly LoopBindingPathSegment[]; from: number }
  | { kind: 'omit'; segments: readonly LoopBindingPathSegment[]; exclude: readonly string[] }

/** An adapter's spelling of a {@link DestructureValue}. */
export interface DestructureSpelling {
  /** The value at `segments` off `item`. */
  accessor(item: string, segments: readonly LoopBindingPathSegment[]): string
  /** The array `parent` from index `from` on. */
  slice(parent: string, from: number): string
  /** The object `parent` without the `keys`. */
  omit(parent: string, keys: readonly string[]): string
}

/** Spell each destructure local's value off the row item `item`. */
export function spellDestructureLocals(
  plan: Pick<LoopPlan<unknown>, 'destructureLocals'>,
  item: string,
  spelling: DestructureSpelling,
): Array<{ name: string; value: string }> {
  return plan.destructureLocals.map(({ name, value }) => {
    const parent = spelling.accessor(item, value.segments)
    if (value.kind === 'slice') return { name, value: spelling.slice(parent, value.from) }
    if (value.kind === 'omit') return { name, value: spelling.omit(parent, value.exclude) }
    return { name, value: parent }
  })
}

/** An adapter's spelling of a {@link SortPlan} over the loop source. */
export interface LoopSortSpelling {
  /** A captured name's SSR value, for the evaluator's env. */
  emit(e: ParsedExpr): string
  /** The evaluator call. */
  eval: CallbackEvalSpelling
  /** The structured `bf.sort` call over `recv` with the `{keys: …}` descriptor. */
  structured(recv: string, comparator: SortComparator): string
  /** Record the refusal of a comparator neither form models (BF101). */
  refuse(message: string, suggestion: string): void
}

/**
 * The loop source `recv` sorted by the loop's comparator, or `recv` itself
 * without one. A refused comparator is recorded and leaves `recv` unsorted,
 * so the template stays valid.
 */
export function spellSortedSource(sort: SortPlan | null, recv: string, spelling: LoopSortSpelling): string {
  if (!sort) return recv
  if (sort.kind === 'eval') return emitCallbackEval(sort, recv, spelling.emit, spelling.eval)
  if (sort.kind === 'structured-sort') return spelling.structured(recv, sort.comparator)
  spelling.refuse(sort.message, sort.suggestion)
  return recv
}

/**
 * The names a loop's for-header binds: the key and the value of an
 * `entries` object iteration, the param of a `keys` / `values` one, and the
 * item var of an array iteration when it is the param itself. A backend
 * whose for-header scopes its targets to the loop passes these to
 * {@link savedLoopBindings} as names it restores itself.
 */
export function loopHeaderTargets(loop: IRLoop, plan: Pick<LoopPlan<unknown>, 'itemVar'>): string[] {
  if (loop.objectIteration === 'entries') return [loop.index ?? loop.param, loop.param]
  return loop.objectIteration || plan.itemVar === loop.param ? [loop.param] : []
}

/** Where a loop row sits, for {@link savedLoopBindings}. */
export interface LoopRowScopes {
  /** The scope outside the loop. */
  outside: BindingScope
  /** `outside.enterLoopRow(loop)`. */
  row: BindingScope
  /** The template-level names: signals, memos, props and constants. */
  templateLevelNames: ReadonlySet<string>
}

const SAVE_ORDER: readonly ScopeBindingSource[] = ['item', 'index', 'destructure', 'preamble']

/** A row binding a loop saves before its header and restores after its end. */
export interface SavedLoopBinding {
  name: string
  /** The template variable that holds the outer value across the loop. */
  temporary: string
}

/**
 * The row bindings a backend whose `set` is not loop-scoped (Pebble, Twig,
 * Blade) saves before the loop and restores after it (#3386, #3391): each
 * name the row binds that already means something outside it, an enclosing
 * row's binding or a template-level name. JS scopes the callback's bindings
 * to the row; without the restore the last row's value leaks past the loop.
 * They come in the order a row binds them in a template: the for-header's
 * item, the index local, each destructure local, each preamble local.
 *
 * `skip` names the bindings the backend restores itself: those its
 * for-header scopes to the loop ({@link loopHeaderTargets}), or a root prop
 * it restores through its alias. `temporary` spells the holder of the
 * `ordinal`-th saved name; a holder that collides with a row binding or a
 * template-level name gets `_` appended until it does not.
 */
export function savedLoopBindings(
  scopes: LoopRowScopes,
  skip: Iterable<string>,
  temporary: (name: string, ordinal: number) => string,
): SavedLoopBinding[] {
  const skipped = new Set(skip)
  const rank = (name: string) => SAVE_ORDER.indexOf(scopes.row.lookup(name)?.binding.source ?? 'param')
  return scopes.row
    .innermostNames()
    .filter((name) => !skipped.has(name) && (scopes.templateLevelNames.has(name) || scopes.outside.isBound(name)))
    .sort((a, b) => rank(a) - rank(b))
    .map((name, ordinal) => {
      let held = temporary(name, ordinal)
      while (scopes.row.isBound(held) || scopes.templateLevelNames.has(held)) held += '_'
      return { name, temporary: held }
    })
}

/**
 * The `.filter()` predicate a `.filter().map()` loop tests on each row: the
 * predicate with the names it reads renamed for the row, or the refusal of a
 * filter whose predicate never reached the IR (BF101, #3534).
 */
export type LoopFilterPlan = LoopFilterPredicate | { kind: 'refuse'; message: string; suggestion: string }

export interface LoopFilterPredicate {
  kind: 'predicate'
  /** The filter callback's own param. */
  param: string
  /** The predicate as written. */
  predicate: ParsedExpr
  /**
   * The predicate with each capture a row binding would shadow renamed to
   * its alias (`captureAliases`), for an emitter that maps the filter param
   * itself (#3402).
   */
  captured: ParsedExpr
  /**
   * `captured` with the filter param renamed to the loop param too: the
   * predicate read off the row item. The tree is renamed, not the rendered
   * text, so a string literal or a property key of the same spelling stays
   * (#3404).
   */
  onRow: ParsedExpr
  /** Each capture alias and the enclosing name it keeps, for the scope the predicate renders under. */
  aliases: ReadonlyMap<string, string>
}

/** An adapter's spelling of a {@link LoopFilterPlan}. */
export interface LoopFilterSpelling {
  /** The row's condition for a predicate. */
  condition(filter: LoopFilterPredicate): string
  /** Record the refusal of a filter without a predicate. */
  refuse(message: string, suggestion: string): void
  /** The condition that stands in for a refused predicate, so the template stays valid. */
  refused: string
  /** The guard's opening line. */
  open(condition: string): string
  /** The guard's closing line. */
  close: string
}

/**
 * The lines of a loop row: `row` itself, or with a filter `row` inside the
 * guard on the filter's condition.
 */
export function spellFilteredRow(filter: LoopFilterPlan | null, row: readonly string[], spelling: LoopFilterSpelling): string[] {
  if (!filter) return [...row]
  return [spelling.open(filterCondition(filter, spelling)), ...row, spelling.close]
}

function filterCondition(filter: LoopFilterPlan, spelling: LoopFilterSpelling): string {
  if (filter.kind === 'predicate') return spelling.condition(filter)
  spelling.refuse(filter.message, filter.suggestion)
  return spelling.refused
}

function filterPlan(
  loop: IRLoop,
  captureAliases: LoopPlan<unknown>['captureAliases'],
  adapterName: string,
): LoopFilterPlan | null {
  const filter = loop.filterPredicate
  if (!filter) return null
  if (!filter.predicate) return { kind: 'refuse', ...missingFilterPredicateRefusal(filter.raw, adapterName) }
  const captureRenames = new Map(captureAliases.map(({ name, alias }) => [name, alias]))
  const rowRenames = new Map(captureRenames)
  if (filter.param !== loop.param) rowRenames.set(filter.param, loop.param)
  return {
    kind: 'predicate',
    param: filter.param,
    predicate: filter.predicate,
    captured: renameFreeIdentifiers(filter.predicate, captureRenames),
    onRow: renameFreeIdentifiers(filter.predicate, rowRenames),
    aliases: new Map(captureAliases.map(({ name, alias }) => [alias, name])),
  }
}

/** Plan a loop against the scope outside it. */
export function planLoop<Spelled>(loop: IRLoop, ctx: LoopPlanContext<Spelled>): LoopPlan<Spelled> {
  const staticItems = resolveStaticLoopSource(loop.arrayParsed, ctx.localConstants, {
    isNameShadowed: ctx.scope.asShadowPredicate(),
  })
  const staticSource = staticItems !== null ? ctx.spellStatic(staticItems) : null
  const destructure = destructureKind(loop)
  const captureAliases = filterCaptureCollisions(loop).map((name) => ({ name, alias: `__bf_cap_${loop.markerId}_${name}` }))
  return {
    destructure,
    staticSource,
    unresolvableConst: staticSource === null ? unresolvableConst(loop, ctx) : null,
    sort: loop.sortComparator ? lowerSortComparator('sort', loop.sortComparator.arrow, ctx.callbackLowering.adapterName) : null,
    captureAliases,
    filter: filterPlan(loop, captureAliases, ctx.callbackLowering.adapterName),
    itemVar: loop.iterationShape === 'keys' || destructure === 'lowerable' ? '__bf_item' : loop.param,
    indexLocal: indexLocal(loop),
    destructureLocals: destructure === 'lowerable' ? destructureLocals(loop) : [],
  }
}

function indexLocal(loop: IRLoop): string | null {
  if (loop.objectIteration) return null
  return loop.iterationShape === 'keys' ? loop.param : loop.index
}

function destructureLocals(loop: IRLoop): LoopPlan<unknown>['destructureLocals'] {
  return (loop.paramBindings ?? []).map((b) => {
    const segments = b.segments ?? []
    if (b.rest?.kind === 'array') return { name: b.name, value: { kind: 'slice', segments, from: b.rest.from } }
    if (b.rest?.kind === 'object') return { name: b.name, value: { kind: 'omit', segments, exclude: b.rest.exclude.map((k) => k.key) } }
    return { name: b.name, value: { kind: 'path', segments } }
  })
}

function destructureKind(loop: IRLoop): LoopPlan<unknown>['destructure'] {
  if (!loop.paramBindings || loop.paramBindings.length === 0) return 'none'
  return isLowerableLoopDestructure(loop) ? 'lowerable' : 'unlowerable'
}

/**
 * The source is read from its parsed tree, which unwraps parentheses: the
 * raw text of `(entries).map(…)` is no bare identifier, yet it names the
 * same const.
 */
function unresolvableConst(loop: IRLoop, ctx: LoopPlanContext<unknown>): ConstantInfo | null {
  const source = loop.arrayParsed ?? parseExpression(loop.array.trim())
  if (source?.kind !== 'identifier') return null
  const name = source.name
  if (ctx.scope.isBound(name)) return null
  const constant = ctx.localConstants.find((c) => c.name === name)
  return constant && ctx.resolveLiteralConst(name) === null ? constant : null
}
