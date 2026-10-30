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
  stringifyParsedExpr,
  type ParsedExpr,
  type SortComparator,
} from '../expression-parser.ts'
import { PROPS_OBJECT_IDENTIFIER } from '../scope/binding-scope.ts'

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
  captured: CallbackCapture[]
}

/**
 * A free name of an evaluator body and the expression whose SSR value the
 * env binds it to: the name itself, or, for a lifted `props.X` read (see
 * {@link evalBody}), that read.
 */
export interface CallbackCapture {
  name: string
  value: ParsedExpr
}

/** A callback body the runtime evaluator can run: its JSON and its env. */
export interface EvalBody {
  json: string
  captured: CallbackCapture[]
}

/**
 * Serialize a callback body for the runtime evaluator, with the captures its
 * env needs; `null` when the body is outside the evaluator surface. `bound`
 * are the callback's own params.
 *
 * A template has no `props` object: the props are its top-level variables,
 * and the adapters spell `props.X` as the variable `X`. So each `props.X` the
 * body reads, where no param binds `props`, becomes a fresh env name bound to
 * the read itself, which the adapter spells as it spells `props.X` anywhere
 * else. Capturing `props` whole would bind it to an undefined template
 * variable, and the predicate would read every `props.X` as `undefined`.
 */
export function evalBody(body: ParsedExpr, bound: ReadonlySet<string>): EvalBody | null {
  const lifted = liftPropsReads(body, bound)
  const json = serializeParsedExpr(lifted.body)
  if (json === null) return null
  const captured = freeVarsInBody(lifted.body, bound).map((name) => ({
    name,
    value: lifted.values.get(name) ?? { kind: 'identifier' as const, name },
  }))
  return { json, captured }
}

/**
 * `body` with each `props.X` read that no arrow param shadows replaced by an
 * identifier no other name in `body` uses, and the read each identifier
 * stands for. A bare `props` (`props[key]`) is left as it is.
 */
function liftPropsReads(
  body: ParsedExpr,
  bound: ReadonlySet<string>,
): { body: ParsedExpr; values: Map<string, ParsedExpr> } {
  const values = new Map<string, ParsedExpr>()
  if (bound.has(PROPS_OBJECT_IDENTIFIER)) return { body, values }
  const taken = new Set<string>(bound)
  collectNames(body, taken)
  const aliases = new Map<string, string>()
  const aliasFor = (read: Extract<ParsedExpr, { kind: 'member' }>): string => {
    const existing = aliases.get(read.property)
    if (existing !== undefined) return existing
    let alias = `__bf_props_${read.property.replace(/[^A-Za-z0-9_]/g, '_')}`
    while (taken.has(alias)) alias += '_'
    taken.add(alias)
    aliases.set(read.property, alias)
    values.set(alias, read)
    return alias
  }
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value === null || typeof value !== 'object') return value
    const node = value as { kind?: unknown } & Record<string, unknown>
    if (isPropsRead(node)) return { kind: 'identifier', name: aliasFor(node) }
    // An arrow that binds `props` makes it a different value in its body.
    if (node.kind === 'arrow' && (node.params as string[]).includes(PROPS_OBJECT_IDENTIFIER)) return node
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node)) out[k] = walk(v)
    return out
  }
  return { body: walk(body) as ParsedExpr, values }
}

function isPropsRead(node: { kind?: unknown }): node is Extract<ParsedExpr, { kind: 'member' }> {
  const read = node as Partial<Extract<ParsedExpr, { kind: 'member' }>>
  return (
    read.kind === 'member' &&
    read.object?.kind === 'identifier' &&
    read.object.name === PROPS_OBJECT_IDENTIFIER
  )
}

/** Add every identifier and arrow param in `value` to `into`. */
function collectNames(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectNames(v, into)
    return
  }
  if (value === null || typeof value !== 'object') return
  const node = value as { kind?: unknown } & Record<string, unknown>
  if (node.kind === 'identifier' && typeof node.name === 'string') into.add(node.name)
  if (node.kind === 'arrow' && Array.isArray(node.params)) for (const p of node.params as string[]) into.add(p)
  for (const v of Object.values(node)) collectNames(v, into)
}

/**
 * A lowered `.sort` / `.toSorted` comparator: the evaluator call, the
 * structured `{keys: …}` descriptor for a comparator the evaluator cannot
 * model, or BF101.
 */
export type SortPlan =
  | CallbackEvalPlan
  /** A comparator the evaluator cannot model but the `{keys: …}` descriptor can. */
  | { kind: 'structured-sort'; comparator: SortComparator }
  | { kind: 'refuse'; message: string; suggestion: string }

/** A lowered callback method call, as data. */
export type CallbackPlan =
  | SortPlan
  /** A predicate for the adapter's own native form (see `nativePredicate`). */
  | { kind: 'native-predicate'; method: PredicateMethod; param: string; predicate: ParsedExpr }
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
  if (method === 'sort' || method === 'toSorted') return lowerSortComparator(method, arrow, adapterName)
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
  const evaluable = evalBody(arrow.body, new Set(arrow.params.slice(0, 1)))
  if (evaluable !== null) {
    const { helper, forward } = PREDICATE_EVAL[method]
    const operands: CallbackEvalOperand[] = [
      { kind: 'string', value: evaluable.json },
      { kind: 'string', value: param },
    ]
    if (forward !== undefined) operands.push({ kind: 'boolean', value: forward })
    return { kind: 'eval', helper, operands, captured: evaluable.captured }
  }
  if (nativeOk) return native
  return {
    kind: 'refuse',
    message: `'.${method}(...)' predicate is outside the ${options.adapterName} adapter's evaluable surface`,
    suggestion: `Rewrite the predicate as a pure expression the evaluator can serialize (no nested method-call callbacks), or move this position to a '/* @client */' boundary.`,
  }
}

/**
 * Lower a `.sort` / `.toSorted` comparator: the evaluator first, then the
 * structured `{keys: …}` descriptor, otherwise BF101. A loop source's sort
 * (`planLoop`) and `.sort(cmp)` at an expression position decide the same.
 */
export function lowerSortComparator(method: 'sort' | 'toSorted', arrow: Arrow, adapterName: string): SortPlan {
  const plan = sortEvalPlan(arrow.body, arrow.params)
  if (plan) return plan
  const comparator = sortComparatorFromArrow(arrow)
  if (comparator) return { kind: 'structured-sort', comparator }
  return sortRefusal(method, adapterName)
}

/**
 * The evaluator plan for a sort comparator, or `null` when the body is
 * outside the evaluator surface (a `localeCompare` comparator) or the arrow
 * has fewer than the two params a comparator needs. The loop-source sort
 * shares this with `.sort(cmp)` at an expression position.
 */
export function sortEvalPlan(body: ParsedExpr, params: readonly string[]): CallbackEvalPlan | null {
  const evaluable = evalBody(body, new Set(params))
  if (evaluable === null || params.length < 2) return null
  return {
    kind: 'eval',
    helper: 'sort_eval',
    operands: [
      { kind: 'string', value: evaluable.json },
      { kind: 'string', value: params[0]! },
      { kind: 'string', value: params[1]! },
    ],
    captured: evaluable.captured,
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
  const evaluable = evalBody(body, new Set(params))
  if (evaluable === null || init.kind !== 'literal' || params.length < 2) return null
  let seed: CallbackEvalOperand
  if (init.literalType === 'string') seed = { kind: 'string', value: String(init.value) }
  else if (init.literalType === 'number') seed = { kind: 'number', text: String(init.value) }
  else return null
  return {
    kind: 'eval',
    helper: 'reduce_eval',
    operands: [
      { kind: 'string', value: evaluable.json },
      { kind: 'string', value: params[0]! },
      { kind: 'string', value: params[1]! },
      seed,
      { kind: 'string', value: direction },
    ],
    captured: evaluable.captured,
  }
}

function projectionEvalPlan(
  helper: 'map_eval' | 'flat_map_eval',
  body: ParsedExpr,
  params: readonly string[],
): CallbackEvalPlan | null {
  const evaluable = evalBody(body, new Set(params.slice(0, 1)))
  if (evaluable === null) return null
  return {
    kind: 'eval',
    helper,
    operands: [
      { kind: 'string', value: evaluable.json },
      { kind: 'string', value: String(params[0]) },
    ],
    captured: evaluable.captured,
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
  const env = plan.captured.map(({ name, value }) => [name, emit(value)] as const)
  operands.push(spelling.env(env))
  return spelling.call(plan.helper, operands)
}

/**
 * Whether a call that reached an adapter's generic fallback has no lowering
 * (#3493). A zero-arg call reads a getter (`props.value()`, a getter passed
 * as a prop, a context getter `ctx.open()`), unless its receiver is rooted at
 * a JavaScript global (`Date.now()`, `window.performance.now()`): `isGlobal`
 * answers that from the component's bindings and the live loop scope, and a
 * global has no binding in template scope (#3505). A call to a
 * function-valued prop (`props.renderNode(node)`, a render prop) names a
 * value a backend caller never passes, so the guard around it is never taken
 * there; it keeps the callee read. Any other call with arguments
 * (`s().localeCompare('m')`) would lose the call and its arguments.
 * `propsObjectName` is the undestructured props parameter (`props`), `null`
 * when the props are destructured: a destructured render prop is a
 * bare-name call, which the adapters refuse on their own.
 */
export function isUnloweredCall(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  propsObjectName: string | null,
  isGlobal: (name: string) => boolean,
): boolean {
  if (args.length === 0) {
    const root = memberRoot(callee)
    return root !== null && isGlobal(root)
  }
  return !(callee.kind === 'member' && callee.object.kind === 'identifier' && callee.object.name === propsObjectName)
}

/**
 * The identifier a member chain is rooted at, through literal and computed
 * access alike (`window.performance.now`, `Date[key]`,
 * `globalThis[name].now`); `null` for any other callee.
 */
function memberRoot(callee: ParsedExpr): string | null {
  if (callee.kind !== 'member' && callee.kind !== 'index-access') return null
  let object = callee.object
  while (object.kind === 'member' || object.kind === 'index-access') object = object.object
  return object.kind === 'identifier' ? object.name : null
}

/**
 * The BF101 for a call no template lowers: a method outside the array-method
 * catalogue (`s().localeCompare('m')`), a zero-arg call on a JavaScript
 * global (`Date.now()`), or any other callee that is not a getter, a template
 * primitive or a lowering plugin's call. Read as its callee, the call and its
 * arguments would silently disappear (#3493, #3505).
 */
export function unloweredCallRefusal(
  callee: ParsedExpr,
  args: readonly ParsedExpr[],
  adapterName: string,
): { message: string; suggestion: string } {
  const name = stringifyParsedExpr(callee)
  return {
    message: args.length === 0
      ? `Call '${name}()' reads a JavaScript global, which has no ${adapterName} template binding; read as a value it would drop the call`
      : `Call '${name}(...)' has no ${adapterName} template lowering; read as a value it would drop the call and its arguments`,
    suggestion: 'Pre-compute the value in the backend and pass it as a prop, or add /* @client */ for client-only evaluation (no SSR).',
  }
}

/**
 * BF101 for a `.filter(...).map(...)` predicate shape a DSL adapter's filter
 * emitter has no form for: a conditional, a template literal, an object
 * literal, a standalone arrow or regex, or an unsupported node (#3534). The
 * emitters used to stand a truthy constant in for these, so every row
 * rendered; the same predicate outside a loop is evaluated or refused, never
 * guessed.
 */
export function filterPredicateShapeRefusal(shape: string, adapterName: string): { message: string; suggestion: string } {
  return {
    message: `Filter predicate contains ${shape}, which has no ${adapterName} loop-filter form`,
    suggestion: `Rewrite the predicate as comparisons joined with && / || / !, or add /* @client */ for client-only evaluation (no SSR).`,
  }
}

/** BF101 for a loop filter whose predicate never reached the IR (#3534). */
export function missingFilterPredicateRefusal(raw: string, adapterName: string): { message: string; suggestion: string } {
  return {
    message: `Filter predicate '${raw}' has no ${adapterName} loop-filter form`,
    suggestion: `Rewrite the predicate as an expression-body arrow, or add /* @client */ for client-only evaluation (no SSR).`,
  }
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
