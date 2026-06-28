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

import {
  type ParsedExprEmitter,
  type HigherOrderMethod,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type SortComparator,
  type ReduceOp,
  type FlatDepth,
  type FlatMapOp,
  type TemplatePart,
  identifierPath,
  matchSearchParamsMethodCall,
} from '@barefootjs/jsx'

import type { XslateEmitContext } from '../emit-context.ts'
import { XSLATE_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderReduceMethod,
  renderSortEval,
  renderReduceEval,
  renderFlatMethod,
  renderFlatMapMethod,
} from './array-method.ts'

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by `renderBlockBodyCondition` for complex block-body
 * filters. Higher-order predicates are emitted using Kolon's own scalar
 * comparison operators (which delegate to Perl semantics).
 *
 * NOTE: Kolon has no `grep { } @{...}` form, so nested higher-order chains
 * (`x.tags.filter(...).length`) inside a predicate route through the
 * top-level emitter's `$bf`-helper higher-order lowering. This emitter keeps
 * the scalar-comparison surface the predicates the adapter accepts actually
 * use; richer nested shapes fall back to the helper or surface as BF101 via
 * the top-level emitter.
 */
export class XslateFilterEmitter implements ParsedExprEmitter {
  constructor(
    private readonly param: string,
    private readonly localVarMap: Map<string, string>,
    private readonly isStringName: (n: string) => boolean = () => false,
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

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
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
    const l = emit(left)
    const r = emit(right)
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

  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // Nested higher-order inside a filter predicate has no Kolon scalar form;
    // defer to the receiver so the predicate at least references a real value
    // (a richer chain would surface its own diagnostic at the top level).
    void method
    void param
    void predicate
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

  sortMethod(
    _method: 'sort' | 'toSorted',
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string {
    const recv = emit(object)
    // Evaluator path (#2018): serialize the comparator body + emit
    // `$bf.sort_eval`; fall back to the structured `$bf.sort` when the
    // body is outside the evaluator surface (e.g. `localeCompare`).
    return renderSortEval(recv, comparator, emit) ?? renderSortMethod(recv, comparator)
  }

  reduceMethod(method: 'reduce' | 'reduceRight', object: ParsedExpr, reduceOp: ReduceOp, emit: (e: ParsedExpr) => string): string {
    const recv = emit(object)
    const direction = method === 'reduceRight' ? 'right' : 'left'
    return renderReduceEval(recv, reduceOp, direction, emit) ?? renderReduceMethod(recv, reduceOp, direction)
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  flatMapMethod(object: ParsedExpr, op: FlatMapOp, emit: (e: ParsedExpr) => string): string {
    return renderFlatMapMethod(emit(object), op)
  }

  conditional(_test: ParsedExpr, _consequent: ParsedExpr, _alternate: ParsedExpr): string {
    return '1'
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return '1'
  }

  arrowFn(_param: string, _body: ParsedExpr): string {
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

  member(object: ParsedExpr, property: string, _computed: boolean, emit: (e: ParsedExpr) => string): string {
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
    const l = emit(left)
    const r = emit(right)
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

  higherOrder(
    method: HigherOrderMethod,
    object: ParsedExpr,
    param: string,
    predicate: ParsedExpr,
    emit: (e: ParsedExpr) => string,
  ): string {
    // Higher-order array methods all take a JS arrow predicate, lowered to a
    // Kolon lambda `-> $param { PRED }` (callable from Perl as a code ref), and
    // go through the runtime object — consistent with the other array helpers
    // ($bf.includes / $bf.slice / ...). `.find*` map to snake_case runtime
    // methods (like index_of / last_index_of). The `.filter(...).map(...)`
    // *loop* form is handled separately by renderLoop's inline predicate.
    const arrayExpr = emit(object)
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
    void predicate
    void param
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

  sortMethod(
    _method: 'sort' | 'toSorted',
    object: ParsedExpr,
    comparator: SortComparator,
    emit: (e: ParsedExpr) => string,
  ): string {
    const recv = emit(object)
    // Evaluator path (#2018): serialize the comparator body + emit
    // `$bf.sort_eval`; fall back to the structured `$bf.sort` when the
    // body is outside the evaluator surface (e.g. `localeCompare`).
    return renderSortEval(recv, comparator, emit) ?? renderSortMethod(recv, comparator)
  }

  reduceMethod(method: 'reduce' | 'reduceRight', object: ParsedExpr, reduceOp: ReduceOp, emit: (e: ParsedExpr) => string): string {
    const recv = emit(object)
    const direction = method === 'reduceRight' ? 'right' : 'left'
    return renderReduceEval(recv, reduceOp, direction, emit) ?? renderReduceMethod(recv, reduceOp, direction)
  }

  flatMethod(object: ParsedExpr, depth: FlatDepth, emit: (e: ParsedExpr) => string): string {
    return renderFlatMethod(emit(object), depth)
  }

  flatMapMethod(object: ParsedExpr, op: FlatMapOp, emit: (e: ParsedExpr) => string): string {
    return renderFlatMapMethod(emit(object), op)
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

  arrowFn(_param: string, _body: ParsedExpr): string {
    return "''"
  }

  unsupported(_raw: string, _reason: string): string {
    return "''"
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    // Mirror `unsupported`: a bare object literal reaching the dispatcher
    // lowers to the safe empty-string literal, exactly as before the
    // `object-literal` kind existed (byte-identical; Roadmap A-1). Object
    // values that round-trip to a Kolon hashref go through the dedicated
    // `objectLiteralToKolonHashref` lowering in the conditional/attr paths.
    return "''"
  }
}
