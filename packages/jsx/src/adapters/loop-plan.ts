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
 * loop. The adapter keeps the spelling:
 * the loop header, the row bindings, the diagnostics' wording, and the order
 * it emits them in.
 */

import { type ParsedExpr, parseExpression, renameFreeIdentifiers } from '../expression-parser.ts'
import { isLowerableLoopDestructure } from '../loop-destructure.ts'
import type { BindingScope } from '../scope/binding-scope.ts'
import { resolveStaticLoopSource } from '../static-literal.ts'
import type { ConstantInfo, IRLoop, LoopBindingPathSegment } from '../types.ts'
import {
  type CallbackLoweringOptions,
  type CallbackPlan,
  lowerCallbackMethod,
  missingFilterPredicateRefusal,
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
  /** The `.sort` / `.toSorted` comparator's lowering, or `null` without one. */
  sort: CallbackPlan | null
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
    sort: loop.sortComparator ? lowerCallbackMethod('sort', loop.sortComparator.arrow, [], ctx.callbackLowering) : null,
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
