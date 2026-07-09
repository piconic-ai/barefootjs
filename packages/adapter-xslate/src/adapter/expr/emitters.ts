/**
 * ParsedExpr → Kolon emitters for the Text::Xslate template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Two `ParsedExprEmitter` implementations:
 *
 *   - `XslateFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare `$name` signal fallback); self-contained, reads no
 *     adapter state.
 *   - `XslateTopLevelEmitter` — top-level / per-render-var context; depends on
 *     the adapter only through the narrow `XslateEmitContext` seam.
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

import type { XslateEmitContext } from '../emit-context.ts'
import { XSLATE_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
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
 * Local shape for the predicate-lowering helpers (`buildPredicateEval` and the
 * Kolon-lambda fallback). Previously these read a `higher-order` ParsedExpr
 * node directly; after the #2018 P5 collapse the callback arrives as a generic
 * `call` and is destructured by `asCallbackMethodCall` / `callbackMethod`, so
 * the helpers take this narrow record instead.
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
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by `renderBlockBodyCondition` for complex block-body
 * filters. Higher-order predicates are emitted using Kolon's own scalar
 * comparison operators (which delegate to Perl semantics).
 *
 * NOTE: Kolon has no `grep { } @{...}` form, so a nested higher-order call
 * (`x.tags.filter(...)`, `other.some(...)`) inside a predicate has no faithful
 * scalar lowering here. Such predicates surface BF101 via `onUnsupported`
 * (#2038) instead of silently degrading to the callback's receiver.
 */
export class XslateFilterEmitter implements ParsedExprEmitter {
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
    if (name === this.param) return `$${this.param}`
    const signal = this.localVarMap.get(name)
    if (signal) return `$${signal}`
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, _optional: boolean, emit: (e: ParsedExpr) => string): string {
    // `.length` — route through `$bf.length` (handles both array element
    // count and string char count, JS-compatibly). Kolon's builtin `.size()`
    // is array-only and faults on a string.
    if (property === 'length') {
      return `$bf.length(${emit(object)})`
    }
    // Hash field access — Kolon dot works on hash refs.
    return `${emit(object)}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Kolon's `[]` postfix is polymorphic (array index or hash key),
    // mirroring JS — no array/hash split is needed (unlike Perl's
    // `->[]` vs `->{}`). #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → $filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const arg = emit(argument)
    if (op === '!') {
      const needsParens = argument.kind === 'binary' || argument.kind === 'logical'
      return needsParens ? `!(${arg})` : `!${arg}`
    }
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // JS `+` with a string-typed operand is CONCATENATION, not addition —
    // Kolon's `+` is numeric-only and coerces `'Hello, ' + $name` to 0
    // (#2176). Lower to Kolon's `~` concat operator.
    if (isStringConcatBinary(op, left, right, this.isStringName)) {
      return `${l} ~ ${r}`
    }
    // Kolon's `==` / `!=` are value-equality operators that compare strings
    // and numbers correctly — unlike Perl's numeric `==` (which the Mojo
    // adapter must steer around with `eq`/`ne`). Kolon has no `eq`/`ne`
    // operator at all, so string comparisons stay on `==` / `!=` here.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*', '/': '/',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    _arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // A nested callback method inside a filter predicate has no Kolon scalar
    // form. The pre-#2038 behavior degraded it to its receiver, which silently
    // changes predicate semantics (`!other.some(r => …)` collapses to
    // `!other`), so surface BF101 instead. The receiver emit is kept only so
    // the template stays syntactically valid while the build fails.
    this.onUnsupported?.(
      `Filter predicate contains a nested '.${method}(...)' callback, which has no Kolon scalar form`,
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
    return '1'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return '1'
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    return '1'
  }

  regex(_raw: string): string {
    return '1'
  }

  unsupported(_raw: string, _reason: string): string {
    return '1'
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Filter-predicate context: emit the truthy sentinel exactly as
    // `unsupported` does, byte-identical with the pre-`object-literal`
    // fallback (Roadmap A-1). Object values lower to Kolon hashrefs in the
    // conditional/attr paths, not through this dispatcher.
    return '1'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Kolon template's per-render vars (signals, props, locals introduced by `:
 * my $x = ...` lines). Differs from the filter emitter mainly in
 *   - `.length` → `.size()` (Kolon array length),
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `$bf` array helpers.
 */
export class XslateTopLevelEmitter implements ParsedExprEmitter {
  constructor(private readonly ctx: XslateEmitContext) {}

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree —
    // Kolon `nil` (#1897).
    if (name === 'undefined' || name === 'null') return 'nil'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render stash, so a bare `$x` would render empty.
    const inlined = this.ctx._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return `$${name}`
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${value}'`
    if (literalType === 'boolean') return value ? '1' : '0'
    if (literalType === 'null') return 'nil'
    return String(value)
  }

  member(object: ParsedExpr, property: string, _computed: boolean, _optional: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.x` flattens to the bare `$x` the SSR caller binds each prop to
    // (props arrive as individual top-level vars, not a `$props` hashref).
    if (object.kind === 'identifier' && object.name === 'props') {
      return `$${property}`
    }
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic dot lowering below would reference a Kolon var that
    // doesn't exist server-side and silently render ''.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx._resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // `.length` → `$bf.length` (array count or string char count, JS-compat);
    // Kolon's builtin `.size()` is array-only and faults on a string.
    if (property === 'length') return `$bf.length(${obj})`
    // Kolon dot access works for hash refs.
    return `${obj}.${property}`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Kolon's `[]` postfix is polymorphic (array index or hash key),
    // mirroring JS. #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter: count() → $count
    if (callee.kind === 'identifier' && args.length === 0) {
      return `$${callee.name}`
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `$searchParams` reader object, not the
    // generic dot deref `member` would emit (`$searchParams.get`, which drops
    // the arg). Matches the local import binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `$searchParams.${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` / `Math.floor(x)`
    // → `$bf.json($x)` / `$bf.floor($x)`. Args render recursively through this
    // same emitter. A wrong-arity call records BF101 and returns `''`.
    const path = identifierPath(callee)
    const spec = path ? XSLATE_TEMPLATE_PRIMITIVES[path] : undefined
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
    const arg = emit(argument)
    if (op === '!') return `!${arg}`
    if (op === '-') return `-${arg}`
    return arg
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // JS `+` with a string-typed operand is CONCATENATION, not addition —
    // Kolon's `+` is numeric-only and coerces `'Hello, ' + $name` to 0
    // (#2176). Lower to Kolon's `~` concat operator. The adapter's
    // string-value registry catches getter/prop operands with no literal
    // present (`firstName() + lastName()`).
    if (isStringConcatBinary(op, left, right, n => this.ctx._isStringValueName(n))) {
      return `${l} ~ ${r}`
    }
    // Kolon's `==` / `!=` are value-equality operators handling both strings
    // and numbers (unlike Perl's numeric `==`, which the Mojo adapter must
    // route around with `eq`/`ne`). Kolon has no `eq`/`ne` operator, so all
    // equality comparisons — string or numeric — stay on `==` / `!=`.
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    if (op === '&&') return `(${l} && ${r})`
    if (op === '||') return `(${l} || ${r})`
    return `(${l} // ${r})`
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
    // emit `$bf.sort_eval`; fall back to the structured `$bf.sort` when the
    // body is outside the evaluator surface (e.g. `localeCompare`). A
    // comparator that neither serializes nor classifies → BF101.
    if (method === 'sort' || method === 'toSorted') {
      const evalForm = renderSortEval(recv, body, params, emit)
      if (evalForm !== null) return evalForm
      const structured = sortComparatorFromArrow(arrow)
      if (structured !== null) return renderSortMethod(recv, structured)
      this.ctx._recordExprBF101(
        `'.${method}(...)' comparator is outside the Xslate adapter's evaluable / structured surface`,
        `Pre-compute the sorted array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.reduce(fn, init)` / `.reduceRight(fn, init)` (#2018): serialize the
    // reducer body + emit `$bf.reduce_eval`. The init is the trailing arg.
    if (method === 'reduce' || method === 'reduceRight') {
      const direction = method === 'reduceRight' ? 'right' : 'left'
      const init = restArgs[0]
      const evalForm =
        init !== undefined
          ? renderReduceEval(recv, body, params, init, direction, emit)
          : null
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.${method}(...)' is outside the Xslate adapter's evaluable surface (needs a literal initial value and an evaluable reducer body)`,
        `Pre-compute the reduced value, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // `.flatMap(proj)` (#2018 P3): serialize the projection body + emit
    // `$bf.flat_map_eval`.
    if (method === 'flatMap') {
      const evalForm = renderFlatMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.flatMap(...)' projection is outside the Xslate adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Value-producing `.map(cb)` (#2073): serialize the projection body +
    // emit `$bf.map_eval`. (The JSX-returning `.map` is an IRLoop upstream.)
    if (method === 'map') {
      const evalForm = renderMapEval(recv, body, params[0], emit)
      if (evalForm !== null) return evalForm
      this.ctx._recordExprBF101(
        `'.map(...)' projection is outside the Xslate adapter's evaluable surface`,
        `Pre-compute the projected array, or move this position to a '/* @client */' boundary.`,
      )
      return "''"
    }

    // Unknown callback method (should not arrive — CALLBACK_METHODS is closed).
    void object
    return recv
  }

  /**
   * Lower a boolean-predicate callback (`filter` / `find*` / `every` / `some`),
   * extracted from the pre-#2018-P5 `higherOrder` arm. Higher-order array
   * methods all take a JS arrow predicate, lowered to a Kolon lambda
   * `-> $param { PRED }` (callable from Perl as a code ref), and go through the
   * runtime object — consistent with the other array helpers ($bf.includes /
   * $bf.slice / ...). `.find*` map to snake_case runtime methods. The
   * `.filter(...).map(...)` *loop* form is handled separately by renderLoop's
   * inline predicate.
   */
  private _emitPredicateCallback(
    call: PredicateCall,
    arrayExpr: string,
    emit: (e: ParsedExpr) => string,
  ): string {
    const { method, object, param, predicate } = call

    // Evaluator path (#2018 P2): serialize the predicate body + emit the
    // matching `$bf.*_eval` helper (isomorphic with the Go adapter). Falls
    // back to the Kolon-lambda runtime call below for a predicate the
    // evaluator can't model (e.g. a method-call predicate).
    const evalFn: Record<string, [string, boolean?]> = {
      filter: ['filter_eval'], every: ['every_eval'], some: ['some_eval'],
      find: ['find_eval', true], findLast: ['find_eval', false],
      findIndex: ['find_index_eval', true], findLastIndex: ['find_index_eval', false],
    }
    // `.filter(Boolean)` (identity predicate `_t => _t`) keeps the lambda
    // form — it composes through the array-method chain and renders
    // identically to a truthiness filter.
    const isIdentity =
      method === 'filter' && predicate.kind === 'identifier' && predicate.name === param
    const spec = evalFn[method]
    if (spec && !isIdentity) {
      const evalForm = renderPredicateEval(spec[0], arrayExpr, predicate, param, emit, spec[1])
      if (evalForm !== null) return evalForm
    }

    const predBody = this.ctx._renderKolonFilterExprPublic(predicate, param)
    const lambda = `-> $${param} { ${predBody} }`
    const fn: Record<string, string> = {
      filter: 'filter',
      every: 'every',
      some: 'some',
      find: 'find',
      findIndex: 'find_index',
      findLast: 'find_last',
      findLastIndex: 'find_last_index',
    }
    if (fn[method]) return `$bf.${fn[method]}(${arrayExpr}, ${lambda})`
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

  conditional(
    test: ParsedExpr,
    consequent: ParsedExpr,
    alternate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    return `(${emit(test)} ? ${emit(consequent)} : ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Kolon string concatenation (`~`):
    // `'n=' ~ ($count + 1)`. Kolon's `~` is the explicit concat operator.
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${part.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(needsParens ? `(${rendered})` : rendered)
      }
    }
    if (terms.length === 0) return `''`
    return terms.join(' ~ ')
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    // A bare arrow never stands alone at a render position (it's only
    // meaningful as a callback, handled by `callbackMethod`). Emit the safe
    // empty-string literal so a stray emit can't produce a Kolon syntax error.
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
    // refused before reaching here. Emit Kolon's real empty hashref
    // literal, matching the `'{}'` convention `objectLiteralToKolonHashref`
    // already uses for the zero-property case in the spread path. A
    // populated literal is structurally unreachable given the gate, but
    // still degrades safely to the pre-existing empty-string sentinel
    // rather than silently dropping keys.
    return properties.length === 0 ? '{}' : "''"
  }
}
