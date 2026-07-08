/**
 * ParsedExpr → Blade emitters for the Blade template adapter.
 *
 * Ported from `packages/adapter-twig/src/adapter/expr/emitters.ts`
 * (`TwigFilterEmitter` / `TwigTopLevelEmitter`), itself a port of the Jinja
 * adapter's. Two `ParsedExprEmitter` implementations:
 *
 *   - `BladeFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare identifier signal fallback); self-contained, reads no
 *     adapter state.
 *   - `BladeTopLevelEmitter` — top-level / per-render-var context; depends on
 *     the adapter only through the narrow `BladeEmitContext` seam.
 *
 * Divergences from the Twig port, documented at their definition site below:
 *
 *   1. **`$` sigil on every variable reference/read.** Twig has no sigil —
 *      `twigIdent(name)` was both the mangled NAME and the value expression.
 *      Blade compiles to raw PHP, so every read is `$name` — `bladeVar(name)`
 *      (this adapter's helper, `lib/blade-naming.ts`) wraps `bladeIdent`
 *      with the `$`. Every `identifier`/zero-arg-`call` (signal getter) site
 *      below uses `bladeVar`, not `bladeIdent` alone.
 *   2. **Member/index access lowers to `data_get(...)`, not `.`/`[]`.**
 *      Twig's dot/bracket are polymorphic over {stdClass, array, null}; raw
 *      PHP has no equivalent single operator. See `blade-naming.ts`'s file
 *      header (divergence 3) for the full rationale — every `member`/
 *      `indexAccess` call below routes through `bladeMemberAccess`/
 *      `bladeIndexAccess` uniformly, including the `.length` special case
 *      (still `$bf->length(...)`, unchanged mechanism, just `$bf->` syntax).
 *   3. **Symbolic ternary, not word-based `if`/`else`** (unchanged from
 *      Twig, still a Twig→Jinja divergence carried through) — Blade/PHP has
 *      no `X if T else Y` inline-conditional form — `logical`'s `&&`/`||`
 *      lowering and `conditional`'s ternary lowering both emit `(T ? A : B)`.
 *   4. **JS-truthy condition wrapping** (`truthyTest`) — unchanged from the
 *      Twig port: PHP truthiness diverges from JS (`'0'` is PHP-falsy,
 *      JS-truthy; empty arrays are PHP-falsy, JS-truthy for both `[]` and
 *      `{}`). Every condition-TEST position (`!x`, the left operand of
 *      `&&`/`||`, a ternary's test) routes through the shared
 *      `$bf->truthy(...)` runtime helper unless the operand is structurally
 *      already boolean-shaped (`isBooleanResultParsed`). `&&`/`||` still
 *      return the ORIGINAL operand VALUE (not a coerced bool) on the taken
 *      branch — matching JS `a || b` returning `a` itself — only the BRANCH
 *      TEST uses `$bf->truthy`. The left operand's rendered text is emitted
 *      TWICE (once as the test, once as the value) — safe because every
 *      operand reaching this pipeline is a pure, side-effect-free read.
 *   5. **`??` is PHP-native**, covering undefined AND null in ONE operator —
 *      PHP's `??` silences BOTH an undefined-variable/index notice and a
 *      real `null` (`$missing ?? 'fb'` and `$x ?? 'fb'` with `$x = null`
 *      both yield `'fb'`) — verified empirically, same as Twig's own native
 *      `??` (this REPLACES Twig's `strict_variables: false` forgiveness with
 *      a uniform per-use-site policy, since raw PHP has no engine-wide
 *      "never warn on unset var" switch).
 *   6. **`!` (bang), not `not`.** Blade/PHP's unary logical-not is `!`, not
 *      Twig's word-form `not` — `unary`'s `op === '!'` branch emits
 *      `!${truthyTest(...)}`; `truthyTest` already wraps its operand in a
 *      function call (`$bf->truthy(...)`), which binds tighter than `!` in
 *      PHP regardless of the surrounding expression, so no extra parens are
 *      needed.
 *   7. **`.` (dot) is PHP string concatenation, not member access.** Twig's
 *      `~` operator becomes PHP's `.` in `templateLiteral`'s join — every
 *      interpolated (non-string-literal) segment still routes through
 *      `$bf->string(...)` first (PHP's own `(string)` cast, which `.`
 *      invokes internally, diverges from JS `String(x)` — see
 *      `blade-adapter.ts`'s file header, "Stringification").
 *   8. **`===`/`!==` route through `$bf->eq`/`$bf->neq`, never PHP's own
 *      `==`/`!=`/`===`/`!==`.** PHP's `==` is loose equality (`'1' == 1` is
 *      `true` — wrong for JS strict equality), and PHP's OWN `===` is wrong
 *      the other direction (`1 === 1.0` is `false` in PHP, but JS has one
 *      number type — `1 === 1.0` is `true`). `$bf->eq`/`$bf->neq` are the
 *      ONE shared JS-strict-equality implementation (mirrored by the
 *      Evaluator's `_strict_eq`), so binary `===`/`!==` ALWAYS lower to a
 *      method call here — same as the Twig port's divergence 4.
 *   9. **No Blade lambda for the predicate-callback fallback** — unchanged
 *      from Twig. `BladeTopLevelEmitter` uses ONE mechanism for every
 *      higher-order callback (the evaluator-JSON `*_eval` payload). When
 *      `serializeParsedExpr` refuses the body, the call surfaces `BF101`
 *      instead of silently degrading — `.sort`/`.toSorted` is the one
 *      exception, whose non-lambda STRUCTURED fallback (`$bf->sort` with a
 *      `['keys' => […]]` descriptor) survives the port unchanged.
 *      `BladeFilterEmitter` (the loop `.filter().map()` INLINE predicate,
 *      rendered as a plain boolean expression, never a lambda) is otherwise
 *      unaffected and still used for that path plus the filter-predicate
 *      entry point `_renderBladeFilterExprPublic`.
 */

import { groupBinaryOperand,
  isStringConcatBinary,
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type FlatDepth,
  type TemplatePart,
  identifierPath,
  matchSearchParamsMethodCall,
  sortComparatorFromArrow,
} from '@barefootjs/jsx'

import type { BladeEmitContext } from '../emit-context.ts'
import { BLADE_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { bladeVar, escapeBladeSingleQuoted, bladeMemberAccess, bladeIndexAccess } from '../lib/blade-naming.ts'
import { isBooleanResultParsed } from '../boolean-result.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderSortEval,
  renderReduceEval,
  renderPredicateEval,
  renderFlatMethod,
  renderFlatMapEval,
  renderMapEval,
} from './array-method.ts'

/**
 * Local shape for the predicate-lowering helper. Mirrors the Twig port's
 * `PredicateCall`.
 */
type PredicateCall = {
  method: HigherOrderMethod
  object: ParsedExpr
  param: string
  predicate: ParsedExpr
}

// Methods whose callback is a boolean predicate (`<recv>.<m>(x => …)`).
const PREDICATE_METHODS = new Set<HigherOrderMethod>([
  'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
])

/**
 * Route a condition-TEST position through `$bf->truthy(...)` unless the node
 * is structurally already boolean-shaped. See the file header (divergence
 * 4). Shared by both emitters below and reused by the adapter's top-level
 * `convertConditionToBlade` for IR-level `if` / loop-filter conditions.
 */
export function truthyTest(node: ParsedExpr, rendered: string): string {
  return isBooleanResultParsed(node) ? rendered : `$bf->truthy(${rendered})`
}

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by the loop-hoist `.filter().map()` inline condition.
 * Higher-order predicates are emitted using PHP's own scalar comparison
 * operators.
 *
 * NOTE: Blade/PHP has no `[x for x in … if …]`-as-expression form usable
 * inline here (a comprehension is a value producer, not a boolean test), so
 * a nested higher-order call (`x.tags.filter(...)`, `other.some(...)`)
 * inside a predicate has no faithful scalar lowering here either — same
 * BF101 surfacing as the Twig/Jinja ports (#2038) instead of silently
 * degrading to the callback's receiver.
 */
export class BladeFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    private readonly isStringName: (n: string) => boolean = () => false,
    // Records a BF101 for predicate shapes this emitter can only degrade
    // (#2038). Optional so emitter construction stays possible without an
    // adapter; a missing hook keeps the old silent-degrade emit.
    private readonly onUnsupported?: (message: string, reason?: string) => void,
  ) {}

  identifier(name: string): string {
    if (name === this.param) return bladeVar(this.param)
    const signal = this.localVarMap.get(name)
    if (signal) return bladeVar(signal)
    return bladeVar(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeBladeSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'null'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` — route through `$bf->length` (handles both array element
    // count and string char count, JS-compatibly).
    if (property === 'length') {
      return `$bf->length(${emit(object)})`
    }
    // Attribute / hash-key access — `data_get` resolves array keys and
    // object properties transparently, null-safe. See the file header,
    // divergence 2.
    return bladeMemberAccess(emit(object), property)
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // `data_get` is polymorphic (list index or hash key), mirroring JS — no
    // list/hash split is needed. #1897 (data-table's `selected()[index]`).
    return bladeIndexAccess(emit(object), emit(index))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → $filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return bladeVar(callee.name)
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `!${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${emit(argument)}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // See the file header, divergence 8: PHP's `==`/`!=`/`===`/`!==` are
    // NEVER emitted for JS `===`/`!==`. `$bf->eq`/`$bf->neq` are the one
    // shared JS-strict-equality implementation.
    if (op === '===') return `$bf->eq(${l}, ${r})`
    if (op === '!==') return `$bf->neq(${l}, ${r})`
    // JS `+` with a string-typed operand is CONCATENATION, not addition —
    // PHP's `+` fatals on non-numeric strings ("Unsupported operand
    // types", #2176). Lower to PHP's `.` concat operator.
    if (isStringConcatBinary(op, left, right, this.isStringName)) {
      return `${l} . ${r}`
    }
    const opMap: Record<string, string> = {
      '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergences 3 & 4: the branch TEST goes through
    // `$bf->truthy`, the RETURNED value stays the original operand text (`l`
    // appears twice for `&&`/`||`), and the ternary is the symbolic
    // `(test ? a : b)` form.
    if (op === '&&') return `(${truthyTest(left, l)} ? ${r} : ${l})`
    if (op === '||') return `(${truthyTest(left, l)} ? ${l} : ${r})`
    // See the file header, divergence 5: PHP's `??` is native and covers
    // both undefined and null in one operator.
    return `(${l} ?? ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    _arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // A nested callback method inside a filter predicate has no Blade scalar
    // form. Surface BF101 instead of silently changing predicate semantics
    // (`!other.some(r => …)` collapsing to `!other`).
    this.onUnsupported?.(
      `Filter predicate contains a nested '.${method}(...)' callback, which has no Blade scalar form`,
      `Rewrite the predicate without a nested callback method, or add /* @client */ for client-only evaluation (no SSR).`,
    )
    return emit(object)
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderFlatMethod(emit(object), depth, emit)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return 'true'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return 'true'
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    return 'true'
  }

  regex(_raw: string): string {
    return 'true'
  }

  unsupported(_raw: string, _reason: string): string {
    return 'true'
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: emit the truthy sentinel exactly as
    // `unsupported` does. Object values lower to PHP arrays in the
    // conditional/attr paths, not through this dispatcher.
    return 'true'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Blade template's per-render context vars (signals, props, locals
 * introduced by `@php($x = …)`). Differs from the filter emitter mainly in
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `$bf->*` array/evaluator helpers,
 *   - no lambda fallback exists (see the file header, divergence 9).
 */
export class BladeTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly ctx: BladeEmitContext) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree — PHP
    // `null` (#1897).
    if (name === 'undefined' || name === 'null') return 'null'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render context, so a bare reference would
    // resolve to an undefined variable.
    const inlined = this.ctx._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return bladeVar(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeBladeSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'null'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare context var the SSR caller binds each
    // prop to (props arrive as individual top-level context entries, not a
    // nested `props` hash).
    if (object.kind === 'identifier' && object.name === 'props') {
      return bladeVar(property)
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic `data_get` lowering below would reference a context var that
    // doesn't exist server-side and resolve to `null`.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx._resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // `.length` → `$bf->length` (array count or string char count, JS-compat).
    if (property === 'length') return `$bf->length(${obj})`
    // See the file header, divergence 2: uniform `data_get`, null-safe over
    // stdClass/array/null.
    return bladeMemberAccess(obj, property)
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // `data_get` is polymorphic (list index or hash key), mirroring JS.
    // #1897 (data-table's `selected()[index]`).
    return bladeIndexAccess(emit(object), emit(index))
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return bladeVar(callee.name)
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `searchParams` reader object, not the
    // generic dot deref `member` would emit. Matches the local import
    // binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `${bladeVar('searchParams')}->${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` / `Math.floor(x)`
    // → `$bf->json(x)` / `$bf->floor(x)`. Args render recursively through
    // this same emitter. A wrong-arity call records BF101 and returns `''`.
    const path = identifierPath(callee)
    const spec = path ? BLADE_TEMPLATE_PRIMITIVES[path] : undefined
    if (path && spec) {
      if (args.length === spec.arity) {
        return spec.emit(args.map(emit))
      }
      this.ctx._recordExprBF101(
        `templatePrimitive '${path}' expects ${spec.arity} arg(s), got ${args.length}`,
        `Call '${path}' with exactly ${spec.arity} argument(s).`,
      )
      return "''"
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `!${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${emit(argument)}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // See the file header, divergence 8: PHP's `==`/`!=`/`===`/`!==` are
    // NEVER emitted for JS `===`/`!==`.
    if (op === '===') return `$bf->eq(${l}, ${r})`
    if (op === '!==') return `$bf->neq(${l}, ${r})`
    // JS `+` with a string-typed operand is CONCATENATION, not addition —
    // PHP's `+` fatals on non-numeric strings ("Unsupported operand
    // types", #2176). Lower to PHP's `.` concat operator. Structural
    // detection (string-literal / template-literal operands) carries the
    // decision; this context has no string-name registry.
    if (isStringConcatBinary(op, left, right, () => false)) {
      return `${l} . ${r}`
    }
    const opMap: Record<string, string> = {
      '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergences 3 & 4.
    if (op === '&&') return `(${truthyTest(left, l)} ? ${r} : ${l})`
    if (op === '||') return `(${truthyTest(left, l)} ? ${l} : ${r})`
    // See the file header, divergence 5: PHP's `??` is native.
    return `(${l} ?? ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    const recv = emit(object)
    const body = arrow.body
    const params = arrow.params

    // Predicate family (#2018 P2/P5): `filter` / `find*` / `every` / `some`.
    if (PREDICATE_METHODS.has(method as HigherOrderMethod)) {
      return this._emitPredicateCallback(
        { method: method as HigherOrderMethod, object, param: params[0], predicate: body },
        recv,
        emit,
      )
    }

    // `.sort(cmp)` / `.toSorted(cmp)` (#2018): serialize the comparator body +
    // emit `$bf->sort_eval`; fall back to the structured `$bf->sort` when the
    // body is outside the evaluator surface (e.g. `localeCompare`). This
    // structured fallback is data (a `['keys' => […]]` descriptor), never a
    // lambda, so it ports unchanged — see the file header, divergence 9.
    if (method === 'sort' || method === 'toSorted') {
      const evalForm = renderSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const structured = sortComparatorFromArrow(arrow)
      if (structured !== null) return renderSortMethod(recv, structured)
      this.ctx._recordExprBF101(
        `'.${method}(...)' comparator is outside the Blade adapter's evaluable / structured surface`,
        `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.reduce(fn, init)` / `.reduceRight(fn, init)` (#2018): serialize the
    // reducer body + emit `$bf->reduce_eval`. The init is the trailing arg.
    if (method === 'reduce' || method === 'reduceRight') {
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      const evalForm =
        init !== undefined
          ? renderReduceEval(recv, body, params, init, direction, emit)
          : null
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.${method}(...)' is outside the Blade adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
        `Pre-compute the reduced value, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.flatMap(proj)` (#2018 P3): serialize the projection body + emit
    // `$bf->flat_map_eval`.
    if (method === 'flatMap') {
      const evalForm = renderFlatMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.flatMap(...)' projection is outside the Blade adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Value-producing `.map(cb)` (#2073): serialize the projection body +
    // emit `$bf->map_eval`. (The JSX-returning `.map` is an IRLoop upstream.)
    if (method === 'map') {
      const evalForm = renderMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.map(...)' projection is outside the Blade adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Unknown callback method (should not arrive — CALLBACK_METHODS is closed).
    void object
    return recv
  }

  /**
   * Lower a boolean-predicate callback (`filter` / `find*` / `every` /
   * `some`). See the file header, divergence 9: Blade has no lambda
   * expression, so — unlike Kolon — there is no non-evaluator fallback here.
   * A predicate the evaluator can't model surfaces `BF101`.
   */
  private _emitPredicateCallback(
    call: PredicateCall,
    arrayExpr: string,
    emit: (e: ParsedExpr) => string,
  ): string {
    const { method, param, predicate } = call

    const evalFn: Record<string, [string, boolean?]> = {
      filter: ['filter_eval'], every: ['every_eval'], some: ['some_eval'],
      find: ['find_eval', true], findLast: ['find_eval', false],
      findIndex: ['find_index_eval', true], findLastIndex: ['find_index_eval', false],
    }
    // `.filter(Boolean)` (identity predicate `_t => _t`) still needs the
    // evaluator path on Blade (no lambda fallback) — the identity predicate
    // serializes fine (`{"kind":"identifier","name":"_t"}`), so this isn't a
    // special case here the way it is for Kolon's lambda form.
    const spec = evalFn[method]
    if (spec) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    this.ctx._recordExprBF101(
      `'.${method}(...)' predicate is outside the Blade adapter's evaluable surface — Blade has no lambda-expression form to fall back to`,
      `Rewrite the predicate as a pure expression the evaluator can serialize (no nested method-call callbacks), or move this position to a '/* @client */' boundary.`,
    )
    return "''"
  }

  arrayLiteral(elements: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    return `[${elements.map(emit).join(', ')}]`
  }

  arrayMethod(
    method: ArrayMethod,
    object: ParsedExpr,
    args: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderArrayMethod(method, object, args, emit)
  }

  flatMethod(
    object: ParsedExpr,
    depth: FlatDepth | { expr: ParsedExpr },
    emit: (e: ParsedExpr) => string,
  ): string {
    return renderFlatMethod(emit(object), depth, emit)
  }

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // See the file header, divergence 3: symbolic ternary.
    return `(${truthyTest(test, emit(test))} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → PHP string concatenation (`.`):
    // `'n=' . $bf->string($count + 1)`. Every interpolated (non-string-
    // literal) segment routes through `$bf->string(...)` before
    // concatenation — PHP's `.` stringifies each operand with the same
    // `(string)` cast semantics that diverge from JS `String(x)` for
    // floats/booleans/null (see `blade-adapter.ts`'s file header,
    // "Stringification").
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${escapeBladeSingleQuoted(part.value)}'`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(`$bf->string(${needsParens ? `(${rendered})` : rendered})`)
      }
    }
    if (terms.length === 0) return `''`
    return terms.join(' . ')
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    // A bare arrow never stands alone at a render position (it's only
    // meaningful as a callback, handled by `callbackMethod`). Emit the safe
    // empty-string literal so a stray emit can't produce a Blade syntax
    // error.
    return "''"
  }

  regex(_raw: string): string {
    // A bare regex literal has no template-render form — mirror `unsupported`.
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    return "''"
  }

  objectLiteral(properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // The shared `isSupported` gate only ever lets this dispatcher see an
    // object literal as the EMPTY (`?? {}`) fallback operand of `??`
    // (expression-parser.ts, `logical` case) — any other object literal is
    // refused before reaching here. Emit PHP's real empty array literal,
    // matching the `'[]'` convention `objectLiteralToBladeDict` already uses
    // for the zero-property case in the spread path. A populated literal is
    // structurally unreachable given the gate, but still degrades safely to
    // the pre-existing empty-string sentinel rather than silently dropping
    // keys.
    return properties.length === 0 ? '[]' : "''"
  }
}
