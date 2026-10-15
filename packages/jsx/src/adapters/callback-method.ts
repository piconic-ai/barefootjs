/**
 * The higher-order callback chain shared by the DSL adapters (#3477).
 *
 * `xs.filter(x => …)`, `xs.toSorted((a, b) => …)`, `xs.reduce((acc, x) => …,
 * init)` and the rest of {@link CALLBACK_METHODS} lower the same way on every
 * DSL backend: the runtime evaluator first (the callback body travels as
 * serialized `ParsedExpr` JSON, see `serializeParsedExpr`), then a structured
 * fallback (`.sort` only, the `{keys: …}` descriptor), then the adapter's own
 * native predicate form where it has one (Kolon lambdas, Ruby blocks, Perl
 * `grep`), and otherwise BF101. {@link lowerCallbackMethod} makes those
 * decisions once and returns them as a plan; an adapter only spells the
 * result through {@link CallbackEvalSpelling}.
 *
 * A callback that reads its index or array parameter never gets here: the
 * support gate refuses it (`unboundCallbackParamRead`), because no DSL
 * runtime binds those.
 */

import {
  freeVarsInBody,
  hasOpaqueCall,
  readsNestedCallbackIndex,
  serializeParsedExpr,
  sortComparatorFromArrow,
  type ParsedExpr,
  type SortComparator,
} from '../expression-parser.ts'

type Arrow = Extract<ParsedExpr, { kind: 'arrow' }>

/** The predicate members of `CALLBACK_METHODS`. */
export type PredicateMethod =
  | 'filter'
  | 'every'
  | 'some'
  | 'find'
  | 'findIndex'
  | 'findLast'
  | 'findLastIndex'

const PREDICATE_EVAL: Readonly<Record<PredicateMethod, { helper: CallbackEvalHelper; forward?: boolean }>> = {
  filter: { helper: 'filter_eval' },
  every: { helper: 'every_eval' },
  some: { helper: 'some_eval' },
  find: { helper: 'find_eval', forward: true },
  findLast: { helper: 'find_eval', forward: false },
  findIndex: { helper: 'find_index_eval', forward: true },
  findLastIndex: { helper: 'find_index_eval', forward: false },
}

/** Whether `method` is one of the {@link PredicateMethod}s. */
export function isPredicateMethod(method: string): method is PredicateMethod {
  return Object.hasOwn(PREDICATE_EVAL, method)
}

/** The runtime evaluator helpers, by id. Every DSL runtime spells them the same. */
export type CallbackEvalHelper =
  | 'sort_eval'
  | 'reduce_eval'
  | 'filter_eval'
  | 'every_eval'
  | 'some_eval'
  | 'find_eval'
  | 'find_index_eval'
  | 'flat_map_eval'
  | 'map_eval'

/** An evaluator-call operand after the receiver and before the env. */
export type CallbackEvalOperand =
  | { kind: 'string'; value: string }
  /** A number literal's source text. */
  | { kind: 'number'; text: string }
  | { kind: 'boolean'; value: boolean }

/**
 * An evaluator call: `helper(recv, ...operands, env)`. The operands carry the
 * serialized body, the callback's param names and the per-helper extras (a
 * reduce's initial value and direction, a find's direction). `captured` are
 * the body's free names; the env maps each to its SSR value.
 */
export interface CallbackEvalPlan {
  kind: 'eval'
  helper: CallbackEvalHelper
  operands: CallbackEvalOperand[]
  captured: string[]
}

/** A lowered callback method call, as data. */
export type CallbackPlan =
  | CallbackEvalPlan
  /** A comparator the evaluator cannot model but the `{keys: …}` descriptor can. */
  | { kind: 'structured-sort'; comparator: SortComparator }
  /** A predicate for the adapter's own native form (see `nativePredicate`). */
  | { kind: 'native-predicate'; method: PredicateMethod; param: string; predicate: ParsedExpr }
  | { kind: 'refuse'; message: string; suggestion: string }
  /** A method outside `CALLBACK_METHODS`; unreachable, as the parser recognises only those. */
  | { kind: 'receiver' }

export interface CallbackLoweringOptions {
  /** The display name BF101 uses: "the Jinja adapter". */
  adapterName: string
  /**
   * The adapter lowers a predicate the evaluator cannot model to a native
   * form (Xslate, ERB, Mojolicious). Such an adapter also takes the
   * identity filter (`xs.filter(x => x)`) natively without trying the
   * evaluator.
   */
  nativePredicate?: boolean
}

/** Lower `<recv>.<method>(arrow, ...restArgs)`. */
export function lowerCallbackMethod(
  method: string,
  arrow: Arrow,
  restArgs: readonly ParsedExpr[],
  options: CallbackLoweringOptions,
): CallbackPlan {
  const { adapterName } = options
  const { body, params } = arrow
  if (isPredicateMethod(method)) return lowerPredicate(method, arrow, options)
  if (method === 'sort' || method === 'toSorted') {
    const plan = sortEvalPlan(body, params)
    if (plan) return plan
    const comparator = sortComparatorFromArrow(arrow)
    if (comparator) return { kind: 'structured-sort', comparator }
    return sortRefusal(method, adapterName)
  }
  if (method === 'reduce' || method === 'reduceRight') {
    const init = restArgs[0]
    const plan = init ? reduceEvalPlan(body, params, init, method === 'reduceRight' ? 'right' : 'left') : null
    return (
      plan ?? {
        kind: 'refuse',
        message: `'.${method}(...)' is outside the ${adapterName} adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
        suggestion: `Pre-compute the reduced value, or move this position to a '/* @client */' boundary.`,
      }
    )
  }
  if (method === 'flatMap' || method === 'map') {
    const plan = projectionEvalPlan(method === 'map' ? 'map_eval' : 'flat_map_eval', body, params)
    return (
      plan ?? {
        kind: 'refuse',
        message: `'.${method}(...)' projection is outside the ${adapterName} adapter's evaluable surface`,
        suggestion: `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      }
    )
  }
  return { kind: 'receiver' }
}

function lowerPredicate(method: PredicateMethod, arrow: Arrow, options: CallbackLoweringOptions): CallbackPlan {
  const param = String(arrow.params[0])
  const native: CallbackPlan = { kind: 'native-predicate', method, param, predicate: arrow.body }
  // A native form lowers an opaque call to a read of its callee, silently, and
  // binds no nested callback's index, so such a predicate takes the
  // evaluator or BF101 on every adapter alike.
  const nativeOk =
    options.nativePredicate === true && !hasOpaqueCall(arrow.body) && !readsNestedCallbackIndex(arrow.body)
  const identity = method === 'filter' && arrow.body.kind === 'identifier' && arrow.body.name === param
  if (nativeOk && identity) return native
  const json = serializeParsedExpr(arrow.body)
  if (json !== null) {
    const { helper, forward } = PREDICATE_EVAL[method]
    const operands: CallbackEvalOperand[] = [
      { kind: 'string', value: json },
      { kind: 'string', value: param },
    ]
    if (forward !== undefined) operands.push({ kind: 'boolean', value: forward })
    return { kind: 'eval', helper, operands, captured: freeVarsInBody(arrow.body, new Set(arrow.params.slice(0, 1))) }
  }
  if (nativeOk) return native
  return {
    kind: 'refuse',
    message: `'.${method}(...)' predicate is outside the ${options.adapterName} adapter's evaluable surface`,
    suggestion: `Rewrite the predicate as a pure expression the evaluator can serialize (no nested method-call callbacks), or move this position to a '/* @client */' boundary.`,
  }
}

/**
 * The evaluator plan for a sort comparator, or `null` when the body is
 * outside the evaluator surface (a `localeCompare` comparator) or the arrow
 * has fewer than the two params a comparator needs. The loop-source sort
 * shares this with `.sort(cmp)` at an expression position.
 */
export function sortEvalPlan(body: ParsedExpr, params: readonly string[]): CallbackEvalPlan | null {
  const json = serializeParsedExpr(body)
  if (json === null || params.length < 2) return null
  return {
    kind: 'eval',
    helper: 'sort_eval',
    operands: [
      { kind: 'string', value: json },
      { kind: 'string', value: params[0]! },
      { kind: 'string', value: params[1]! },
    ],
    captured: freeVarsInBody(body, new Set(params)),
  }
}

/** The BF101 for a comparator neither the evaluator nor the descriptor can model. */
export function sortRefusal(method: string, adapterName: string): { kind: 'refuse'; message: string; suggestion: string } {
  return {
    kind: 'refuse',
    message: `'.${method}(...)' comparator is outside the ${adapterName} adapter's evaluable / structured surface`,
    suggestion: `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
  }
}

/**
 * The evaluator plan for a reducer. Only a string or number literal seeds
 * the fold; anything else (and a body outside the evaluator surface, or a
 * reducer without both `acc` and item params) returns `null`.
 */
function reduceEvalPlan(
  body: ParsedExpr,
  params: readonly string[],
  init: ParsedExpr,
  direction: 'left' | 'right',
): CallbackEvalPlan | null {
  const json = serializeParsedExpr(body)
  if (json === null || init.kind !== 'literal' || params.length < 2) return null
  let seed: CallbackEvalOperand
  if (init.literalType === 'string') seed = { kind: 'string', value: String(init.value) }
  else if (init.literalType === 'number') seed = { kind: 'number', text: String(init.value) }
  else return null
  return {
    kind: 'eval',
    helper: 'reduce_eval',
    operands: [
      { kind: 'string', value: json },
      { kind: 'string', value: params[0]! },
      { kind: 'string', value: params[1]! },
      seed,
      { kind: 'string', value: direction },
    ],
    captured: freeVarsInBody(body, new Set(params)),
  }
}

function projectionEvalPlan(
  helper: 'map_eval' | 'flat_map_eval',
  body: ParsedExpr,
  params: readonly string[],
): CallbackEvalPlan | null {
  const json = serializeParsedExpr(body)
  if (json === null) return null
  return {
    kind: 'eval',
    helper,
    operands: [
      { kind: 'string', value: json },
      { kind: 'string', value: String(params[0]) },
    ],
    captured: freeVarsInBody(body, new Set(params.slice(0, 1))),
  }
}

/** How one DSL backend spells an evaluator call. */
export interface CallbackEvalSpelling {
  /** `helper(operands)`: `bf.sort_eval(…)`, `$bf->sort_eval(…)`, `bf->sort_eval(…)`. */
  call(helper: CallbackEvalHelper, operands: readonly string[]): string
  /** A single-quoted string literal, escaped for the backend. */
  string(value: string): string
  /** `true` / `false`, or Perl's `1` / `0`. */
  boolean(value: boolean): string
  /** The env literal mapping each captured name to its SSR value, `{}` when empty. */
  env(entries: ReadonlyArray<readonly [name: string, value: string]>): string
}

/**
 * Emit an evaluator plan. `recv` is the already-emitted receiver; `emit`
 * renders each captured name's SSR value, after the receiver.
 */
export function emitCallbackEval(
  plan: CallbackEvalPlan,
  recv: string,
  emit: (e: ParsedExpr) => string,
  spelling: CallbackEvalSpelling,
): string {
  const operands = [recv]
  for (const operand of plan.operands) {
    if (operand.kind === 'string') operands.push(spelling.string(operand.value))
    else if (operand.kind === 'number') operands.push(operand.text)
    else operands.push(spelling.boolean(operand.value))
  }
  const env = plan.captured.map((name) => [name, emit({ kind: 'identifier', name })] as const)
  operands.push(spelling.env(env))
  return spelling.call(plan.helper, operands)
}

/**
 * The BF101 for a callback method nested inside a filter predicate, which a
 * predicate emitter has no scalar form for.
 */
export function nestedCallbackRefusal(method: string, adapterName: string): { message: string; suggestion: string } {
  return {
    message: `Filter predicate contains a nested '.${method}(...)' callback, which has no ${adapterName} scalar form`,
    suggestion: `Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).`,
  }
}
