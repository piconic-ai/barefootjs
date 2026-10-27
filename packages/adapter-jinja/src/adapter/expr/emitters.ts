/**
 * ParsedExpr → Jinja2 emitters for the Jinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/expr/emitters.ts`
 * (`XslateFilterEmitter` / `XslateTopLevelEmitter`). Two `ParsedExprEmitter`
 * implementations:
 *
 *   - `JinjaFilterEmitter` — filter/predicate context (loop param + local
 *     aliases + bare identifier signal fallback); self-contained, reads no
 *     adapter state.
 *   - `JinjaTopLevelEmitter` — top-level / per-render-var context; depends on
 *     the adapter only through the narrow `JinjaEmitContext` seam.
 *
 * Two deliberate divergences from the Kolon port, both documented at their
 * definition site below:
 *
 *   1. **JS-truthy condition wrapping** (`truthyTest`) — Python truthiness
 *      diverges from JS on empty containers; Perl doesn't have this problem
 *      (a Perl ref is always true), so Kolon never needed this. Every
 *      condition-TEST position (`!x`, the left operand of `&&`/`||`, a
 *      ternary's test) routes through the shared `bf.truthy(...)` runtime
 *      helper unless the operand is structurally already boolean-shaped
 *      (`isBooleanResultParsed`). `&&`/`||` still return the ORIGINAL
 *      operand VALUE (not a coerced bool) on the taken branch — matching JS
 *      `a || b` returning `a` itself, not `true` — only the BRANCH TEST uses
 *      `bf.truthy`. Because Jinja's `if/else` ternary has no way to reuse an
 *      already-computed test value for both the test and (conditionally) the
 *      result, the left operand's rendered text is emitted TWICE (once as
 *      the test, once as the value) — safe because every operand reaching
 *      this pipeline is a pure, side-effect-free read (a signal/prop lookup
 *      or a call into a pure runtime helper), never a stateful expression.
 *   2. **No Jinja lambda for the predicate-callback fallback.** Kolon's
 *      `-> $x { … }` lambda is the Xslate top-level emitter's fallback when a
 *      `.filter`/`.every`/`.some`/`.find*` predicate can't be serialized to
 *      the runtime evaluator's JSON form (e.g. a nested method-call
 *      predicate). Jinja has no lambda-expression syntax at all, so there is
 *      no equivalent fallback to port. `JinjaTopLevelEmitter` therefore uses
 *      ONE mechanism for every higher-order callback: the evaluator-JSON
 *      `*_eval` payload (`bf.filter_eval`, `bf.sort_eval`, …). When
 *      `serializeParsedExpr` refuses the body, the call surfaces `BF101`
 *      instead of silently degrading — `.sort`/`.toSorted` is the one
 *      exception, whose non-lambda STRUCTURED fallback (`bf.sort` with a
 *      `{keys: […]}` descriptor, no callback body at all) survives the port
 *      unchanged since it was never lambda-shaped to begin with.
 *      `JinjaFilterEmitter` (the loop `.filter().map()` INLINE predicate,
 *      rendered as a plain boolean expression, never a lambda) is otherwise
 *      unaffected and still used for that path plus the filter-predicate
 *      entry point `_renderJinjaFilterExprPublic`.
 */

import {
  arithmeticHelper,
  groupBinaryOperand,
  groupUnaryOperand,
  literalMemberIndex,
  groupObjectLiteralSegments,
  type ParsedExprEmitter,
  type LoweringEmitter,
  type LoweringNode,
  type ArrayMethod,
  type LiteralType,
  type ParsedExpr,
  type ObjectLiteralProperty,
  type FlatDepth,
  type TemplatePart,
  identifierPath,
  matchSearchParamsMethodCall,
  queryHrefArgs,
  isValidHelperId,
  isBooleanResultParsed,
  lowerCallbackMethod,
  emitCallbackEval,
  nestedCallbackRefusal,
  filterPredicateShapeRefusal,
  isUnloweredCall,
  isRootPropsObject,
  unloweredCallRefusal,
  type CallbackLoweringOptions,
} from '@barefootjs/jsx'

import type { JinjaEmitContext } from '../emit-context.ts'
import { JINJA_TEMPLATE_PRIMITIVES } from '../lib/constants.ts'
import { jinjaIdent, escapeJinjaSingleQuoted, jinjaHashKey } from '../lib/jinja-naming.ts'
import {
  renderArrayMethod,
  renderSortMethod,
  renderFlatMethod,
  EVAL_SPELLING,
} from './array-method.ts'

// The display name BF101 uses; a native predicate form does not exist here.
export const CALLBACK_LOWERING: CallbackLoweringOptions = { adapterName: 'Jinja' }

/**
 * Route a condition-TEST position through `bf.truthy(...)` unless the node
 * is structurally already boolean-shaped. See the file header (divergence
 * 1). Shared by both emitters below and reused by the adapter's top-level
 * `convertConditionToJinja` for IR-level `if` / loop-filter conditions.
 */
export function truthyTest(node: ParsedExpr, rendered: string): string {
  return isBooleanResultParsed(node) ? rendered : `bf.truthy(${rendered})`
}

function emitComputedMember(object: ParsedExpr, property: string, emit: (e: ParsedExpr) => string): string {
  return `bf.get(${emit(object)}, ${emit(literalMemberIndex(property))})`
}

/**
 * `props.x` on a bare-props-form component flattens to the bare context var
 * the SSR caller binds each prop to (props arrive as individual top-level
 * context entries, not a nested `props` dict). Single door for BOTH
 * `member()` emitters below (#2886) — `JinjaFilterEmitter` lacked this
 * decision entirely (#2879's cross-adapter follow-up), silently reaching
 * `props['x']`, and `props` is undefined in the predicate's context.
 * Returns null for any other receiver so callers fall through to their
 * generic member lowering — `props.a.b` flattens only the inner hop.
 */
function flattenPropsMember(object: ParsedExpr, property: string, isBound: (name: string) => boolean): string | null {
  // A `props` a binding shadows (`isBound`) is that binding, not the
  // component's props object (#3693).
  if (isRootPropsObject(object, isBound)) return jinjaIdent(property)
  return null
}

/**
 * Lowering for the predicate body of a filter / every / some / find, plus the
 * same shape used by the loop-hoist `.filter().map()` inline condition.
 * Higher-order predicates are emitted using Jinja's own scalar comparison
 * operators.
 *
 * NOTE: Jinja has no `[x for x in … if …]`-as-expression form usable inline
 * here (a comprehension is a value producer, not a boolean test), so a
 * nested higher-order call (`x.tags.filter(...)`, `other.some(...)`) inside
 * a predicate has no faithful scalar lowering here either — same BF101
 * surfacing as Kolon (#2038) instead of silently degrading to the
 * callback's receiver.
 */
/**
 * `x.length` through `bf.length`. An optional-chained `x?.length` yields
 * `none` — JS's `undefined` — for an absent receiver instead of
 * `bf.length`'s `0`, so a bare read renders empty and a `??` fallback takes
 * over (#3332). The receiver test matches the `??` lowering's (`is defined
 * and is not none`), as an Undefined is not `none`.
 */
function optionalLength(receiver: string, optional: boolean): string {
  const read = `bf.length(${receiver})`
  return optional ? `(${read} if (${receiver} is defined and ${receiver} is not none) else none)` : read
}

export class JinjaFilterEmitter implements ParsedExprEmitter {
  // Plain field declarations + assignment, NOT TS constructor-parameter-
  // property shorthand: Vite's `bundleConfigFile` externalizes any bare
  // (non-relative) import when loading `vite.config.ts` (see
  // `@barefootjs/jinja/vite`'s docstring), so this file can be loaded
  // directly by Node's OWN native TypeScript type-stripping (enabled by
  // default since Node 22.18/23.6) rather than esbuild — and Node's
  // strip-only mode does not support parameter properties (`SyntaxError
  // [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]`), only plain type annotations.
  private readonly param: string
  private readonly localVarMap: Map<string, string>
  private readonly isStringName: (n: string) => boolean
  // Records a BF101 for predicate shapes this emitter can only degrade
  // (#2038). Optional so emitter construction stays possible without an
  // adapter; a missing hook keeps the old silent-degrade emit.
  private readonly onUnsupported?: (message: string, reason?: string) => void
  // Whether a binding enclosing the predicate (a loop row) binds `name`.
  private readonly isOuterBound: (name: string) => boolean

  constructor(
    param: string,
    localVarMap: Map<string, string>,
    isStringName: (n: string) => boolean = () => false,
    onUnsupported?: (message: string, reason?: string) => void,
    isOuterBound: (name: string) => boolean = () => false,
  ) {
    this.param = param
    this.localVarMap = localVarMap
    this.isStringName = isStringName
    this.onUnsupported = onUnsupported
    this.isOuterBound = isOuterBound
  }

  identifier(name: string): string {
    if (name === this.param) return jinjaIdent(this.param)
    const signal = this.localVarMap.get(name)
    if (signal) return jinjaIdent(signal)
    return jinjaIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeJinjaSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'none'
    return String(value)
  }

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string): string {
    // A callback param spelled `props` (a `.map((props) => …)` row the
    // filter param was renamed to, #3404) or an enclosing binding of that
    // name (#3693) is that binding, not the component props.
    const flat = flattenPropsMember(object, property, n => n === this.param || this.isOuterBound(n))
    if (flat !== null) return flat
    // `.length` — route through `bf.length` (handles both array element
    // count and string char count, JS-compatibly). Jinja's builtin
    // `|length` filter also faults trying to match JS semantics for every
    // input shape, so route through the runtime uniformly.
    if (property === 'length') return optionalLength(emit(object), optional)
    // Bracket/item access, NOT `.` attribute access: Jinja's default
    // `getattr` semantics try a Python ATTRIBUTE first, falling back to a
    // dict key only if no such attribute exists — so `group.items` (a
    // dict key from the JS object) instead resolves to the built-in bound
    // method `dict.items`, raising "not iterable" downstream instead of
    // returning the key's value. `[...]` compiles through Jinja's
    // `getitem`, which tries the KEY first, sidestepping any built-in
    // dict method name (items/keys/values/get/pop/update/...) that would
    // otherwise shadow a same-named JS object field.
    if (computed) return emitComputedMember(object, property, emit)
    return `${emit(object)}['${escapeJinjaSingleQuoted(property)}']`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Jinja's `[]` postfix is polymorphic (list index or dict key),
    // mirroring JS — no list/dict split is needed. #1897 (data-table's
    // `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // Signal getter calls: filter() → filter
    if (callee.kind === 'identifier' && args.length === 0) {
      return jinjaIdent(callee.name)
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `not ${truthyTest(argument, emit(argument))}`
    if (op === '-') return `-${groupUnaryOperand(argument, emit(argument))}`
    return emit(argument)
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = groupBinaryOperand(left, emit(left))
    const r = groupBinaryOperand(right, emit(right))
    // Jinja's `==` / `!=` are value-equality operators that compare strings
    // and numbers correctly — unlike Perl's numeric `==` (which the Mojo
    // adapter must steer around with `eq`/`ne`). Same reasoning as Kolon.
    // `/` and `%` go through the runtime's JS division and remainder
    // (#3474, #3574).
    const helper = arithmeticHelper(op)
    if (helper) return `bf.${helper}(${l}, ${r})`
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergence 1: the branch TEST goes through
    // `bf.truthy`, but the RETURNED value stays the original operand text —
    // `l` appears twice for `&&`/`||` (test + fallback value), safe because
    // every operand here is a pure lookup/call.
    if (op === '&&') return `(${r} if ${truthyTest(left, l)} else ${l})`
    if (op === '||') return `(${l} if ${truthyTest(left, l)} else ${r})`
    // `l is not none` alone is NOT equivalent to JS `??`'s null-or-undefined
    // check: a context var that was never seeded at all (not merely set to
    // `None`) resolves to Jinja's `ChainableUndefined` sentinel under
    // `undefined=ChainableUndefined`, and `Undefined is not none` is TRUE
    // (it's a distinct object, not the `None` singleton) — so the coalesce
    // would silently return the Undefined sentinel itself instead of `r`.
    // Guard with `is defined` too, mirroring the same pair this file's
    // `jinja-adapter.ts` already uses for nullable-optional-prop attribute
    // omission (see that file's header, divergence 5, and the `is defined
    // and is not none` call sites).
    return `(${l} if (${l} is defined and ${l} is not none) else ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    _arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    _restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // A nested callback method inside a filter predicate has no Jinja scalar
    // form. Surface BF101 instead of silently changing predicate semantics
    // (`!other.some(r => …)` collapsing to `!other`).
    const refusal = nestedCallbackRefusal(method, CALLBACK_LOWERING.adapterName)
    this.onUnsupported?.(refusal.message, refusal.suggestion)
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
    return this.refuseShape('a conditional (`?:`)')
  }

  templateLiteral(_parts: TemplatePart[]): string {
    return this.refuseShape('a template literal')
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    return this.refuseShape('a standalone arrow function')
  }

  regex(_raw: string): string {
    return this.refuseShape('a regular expression literal')
  }

  unsupported(_raw: string, reason: string): string {
    return this.refuseShape(`an expression with no template form (${reason})`)
  }

  objectLiteral(_properties: ObjectLiteralProperty[], _raw: string, _emit: (e: ParsedExpr) => string): string {
    return this.refuseShape('an object literal')
  }

  /**
   * A predicate shape this emitter cannot spell is BF101, never a truthy
   * constant standing in for it (#3534): that rendered every row.
   */
  private refuseShape(shape: string): string {
    const refusal = filterPredicateShapeRefusal(shape, CALLBACK_LOWERING.adapterName)
    this.onUnsupported?.(refusal.message, refusal.suggestion)
    return 'true'
  }
}

/**
 * Lowering for top-level expressions whose identifiers resolve against the
 * Jinja template's per-render context vars (signals, props, locals
 * introduced by `{% set x = … %}`). Differs from the filter emitter mainly
 * in
 *   - `conditional` is supported (filter predicates can't return ternaries),
 *   - higher-order methods route through `bf.*` array/evaluator helpers,
 *   - no lambda fallback exists (see the file header, divergence 2).
 */
export class JinjaTopLevelEmitter implements ParsedExprEmitter {
  // Plain field + assignment, not a parameter property — see
  // `JinjaFilterEmitter`'s constructor comment above for why.
  private readonly ctx: JinjaEmitContext

  constructor(ctx: JinjaEmitContext) {
    this.ctx = ctx
  }

  /**
   * Registered-lowering seam (#2843): `emitParsedExpr`'s shared `call` case
   * tries every matcher here BEFORE `call()` itself, so a registered call
   * (the built-in `queryHref`, or any userland plugin) is recognised no
   * matter where it sits in the tree. `render` is what used to live inline
   * in `JinjaAdapter.convertExpressionToJinja` before the object-literal
   * support-gate refusal (`checkSupport`'s `call` arm, now itself
   * registry-aware) made the pre-gate special case unnecessary.
   */
  get lowering(): LoweringEmitter {
    return {
      matchers: this.ctx._loweringMatchers,
      render: (node: LoweringNode, emit: (e: ParsedExpr) => string): string | null => {
        // `query` guard-list — `queryHref`-shaped. The helper includes a
        // pair iff its guard is truthy AND its value is a non-empty string
        // (the client's `if (value)`): a plain `key: v` passes guard
        // `true`, a conditional `key: cond ? v : undefined` passes the
        // lowered cond. Only the `query` helper renders to `bf.query`;
        // another guard-list helper must not be silently mis-rendered as
        // a query.
        if (node.kind === 'guard-list' && node.helper === 'query') {
          const qArgs = queryHrefArgs(node, emit)
          return `bf.query(${qArgs.join(', ')})`
        }
        // Generic `helper-call` (#2069) — the neutral vocabulary's escape
        // hatch for a userland `LoweringPlugin` that lowers to a single
        // runtime-helper invocation. `bf.<helper>(args…)` mirrors the
        // `query` helper's own naming convention exactly: the framework
        // renders the call, the plugin author registers `<helper>` as a
        // Jinja-callable function/filter in their own runtime — same
        // contract as `bf.query` itself, just not built in.
        if (node.kind === 'helper-call' && isValidHelperId(node.helper)) {
          return `bf.${node.helper}(${node.args.map(emit).join(', ')})`
        }
        return null
      },
    }
  }

  identifier(name: string): string {
    // `undefined` / `null` nested inside a larger expression tree — Jinja
    // `none` (#1897).
    if (name === 'undefined' || name === 'null') return 'none'
    // Inline a module-scope pure-string const (`const x = 'literal'`) — it
    // never reaches the per-render context, so a bare reference would
    // resolve to Undefined.
    const inlined = this.ctx._resolveModuleStringConst(name)
    if (inlined !== null) return inlined
    // Same for a literal const of any scope (`const totalPages = 5`,
    // #1897 pagination's `Page {currentPage()} of {totalPages}`).
    const literalConst = this.ctx._resolveLiteralConst(name)
    if (literalConst !== null) return literalConst
    return jinjaIdent(name)
  }

  literal(value: string | number | boolean | null, literalType: LiteralType): string {
    if (literalType === 'string') return `'${escapeJinjaSingleQuoted(String(value))}'`
    if (literalType === 'boolean') return value ? 'true' : 'false'
    if (literalType === 'null') return 'none'
    return String(value)
  }

  member(object: ParsedExpr, property: string, computed: boolean, optional: boolean, emit: (e: ParsedExpr) => string): string {
    // `props.X` reads the root prop even where a loop binding shadows `X`
    // (#3314) — through the alias the loop header assigned — unless a
    // binding shadows `props` itself (#3693).
    if (this.ctx._isRootPropsObject(object)) return jinjaIdent(this.ctx._rootPropReadName(property))
    // Static property access on a module object-literal const
    // (`variantClasses.ghost`, #1897) resolves at compile time — the
    // generic dot lowering below would reference a context var that
    // doesn't exist server-side and silently resolve to Undefined.
    if (object.kind === 'identifier') {
      const staticValue = this.ctx._resolveStaticRecordLiteral(object.name, property)
      if (staticValue !== null) return staticValue
    }
    const obj = emit(object)
    // `.length` → `bf.length` (array count or string char count, JS-compat).
    if (property === 'length') return optionalLength(obj, optional)
    // Bracket/item access, NOT `.` attribute access — see the sibling
    // `JinjaFilterEmitter.member()` for why: Jinja's `.` tries a Python
    // ATTRIBUTE first, so a dict key that happens to share a name with a
    // built-in dict method (`items`, `keys`, `values`, `get`, ...) resolves
    // to the bound method instead of the value. `[...]` (Jinja `getitem`)
    // tries the key first.
    if (computed) return emitComputedMember(object, property, emit)
    return `${obj}['${escapeJinjaSingleQuoted(property)}']`
  }

  indexAccess(object: ParsedExpr, index: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Jinja's `[]` postfix is polymorphic (list index or dict key),
    // mirroring JS. #1897 (data-table's `selected()[index]`).
    return `${emit(object)}[${emit(index)}]`
  }

  call(callee: ParsedExpr, args: ParsedExpr[], emit: (e: ParsedExpr) => string): string {
    // #3144: a zero-arg call to a component-body local bound to an
    // opaque call (`const label = makeLabel(); {label()}`) is NOT a
    // signal getter -- checked before the signal-getter branch below,
    // which would otherwise treat it as one and emit an unbound name.
    if (callee.kind === 'identifier' && args.length === 0 && this.ctx._isOpaqueLocalAccessorCall(callee.name)) {
      this.ctx._recordExprBF101(
        `Call to '${callee.name}(...)' has no Jinja template lowering — '${callee.name}' is a local bound to an opaque call (not a signal/memo getter), so there is no Jinja binding for its result in template scope.`,
        `The reference adapter runs '${callee.name}()' at render time. Add /* @client */ to defer this read to the client, or pre-compute the value in the backend.`,
      )
      return "''"
    }
    // Signal getter: count() → count
    if (callee.kind === 'identifier' && args.length === 0) {
      return jinjaIdent(callee.name)
    }
    // Env-signal method call (#1922): `searchParams().get('sort')` is a real
    // method call on the per-request `searchParams` reader object, not the
    // generic dot deref `member` would emit. Matches the local import
    // binding (incl. an alias).
    if (this.ctx._searchParamsLocals.size > 0) {
      const sp = matchSearchParamsMethodCall(callee, args, this.ctx._searchParamsLocals)
      if (sp) {
        return `searchParams.${sp.method}(${sp.args.map(emit).join(', ')})`
      }
    }
    // Identifier-path templatePrimitive: `JSON.stringify(x)` / `Math.floor(x)`
    // → `bf.json(x)` / `bf.floor(x)`. Args render recursively through this
    // same emitter. A wrong-arity call records BF101 and returns `''`.
    const path = identifierPath(callee)
    const spec = path ? JINJA_TEMPLATE_PRIMITIVES[path] : undefined
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
    // #2994: any other identifier callee reaching here is a call to an
    // arbitrary JS function by bare name — a module-scope `function`/arrow
    // `const` helper being the repro shape. Zero-arg calls already
    // returned above as signal getters, so this is always a call WITH
    // args. Falling through to `emit(callee)` used to silently resolve the
    // bare name against Jinja's undefined-variable semantics (renders
    // empty) and drop every argument. Refuse loudly instead of guessing.
    // No `_boolContext`-style structural exemption here (#3012): scoping
    // the exemption by "is this call's value only consumed for
    // truthiness?" rather than by callee identity let ANY OTHER helper
    // called from a condition/ternary test keep the pre-#2994 broken
    // fallback silently. `isValidElement` — the one caller that
    // legitimately needs to keep working under the degraded fallback
    // (`ui/components/ui/slot`'s `asChild` guard) — is now resolved above
    // as an identity-scoped `templatePrimitive` (`bf.is_element`, backed
    // by the Python port of the shared BarefootJS runtime's shape-check
    // method), so it never reaches this branch at all. Every other
    // bare-name call refuses here unconditionally, in a boolean-test
    // position or not.
    if (callee.kind === 'identifier') {
      this.ctx._recordExprBF101(
        `Call to '${callee.name}(...)' has no Jinja template lowering — '${callee.name}' is not a signal getter, a registered template primitive, or a recognised lowering call, so there is no Python binding for it in template scope.`,
        `A bare-name call to a module-scope helper (or any other JS-only function reference) only exists in the real JS runtime (Hono SSR / CSR) — Jinja has no way to invoke it.`,
      )
      return "''"
    }
    // A method outside the catalogue (`s().localeCompare(q)`) has no
    // lowering; read as its callee, the call and its arguments would vanish
    // (#3493). A getter or function-valued prop keeps the callee read.
    if (isUnloweredCall(callee, args, this.ctx._propsObjectName, this.ctx._isGlobalName)) {
      const refusal = unloweredCallRefusal(callee, args, CALLBACK_LOWERING.adapterName)
      this.ctx._recordExprBF101(refusal.message, refusal.suggestion)
      return "''"
    }
    return emit(callee)
  }

  unary(op: string, argument: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    if (op === '!') return `not ${truthyTest(argument, emit(argument))}`
    if (op === '-') {
      // Unary minus applies JS `ToNumber` like binary `-` (#3533).
      const arg = groupUnaryOperand(argument, emit(argument))
      const operand = this.coerceNullishOperand(op, argument, undefined, arg)
      return operand === arg ? `-${arg}` : `-(${operand})`
    }
    return emit(argument)
  }

  /** Spell `arithmeticOperandCoercion` (#3474): a `null` operand reads as
   * `0`, as JS `ToNumber(null)` does (#3350); an `undefined` one as `NaN`, as
   * `ToNumber(undefined)` does (#3390). */
  private coerceNullishOperand(op: string, expr: ParsedExpr, other: ParsedExpr | undefined, operand: string): string {
    const coercion = this.ctx._arithmeticCoercion(op, expr, other)
    if (coercion === 'undefined') return `bf.number(${operand})`
    return coercion === 'null' ? `(${operand} or 0)` : operand
  }

  binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    // Preserve source grouping: a compound operand re-emitted as infix
    // text is otherwise re-parsed under THIS language's precedence —
    // `(count() + 2) * 3` would silently become `count + 2 * 3` (#2173).
    const l = this.coerceNullishOperand(op, left, right, groupBinaryOperand(left, emit(left)))
    const r = this.coerceNullishOperand(op, right, left, groupBinaryOperand(right, emit(right)))
    // Jinja's `==` / `!=` handle both strings and numbers (unlike Perl's
    // numeric `==`), so all equality comparisons stay on `==` / `!=`.
    // `/` and `%` go through the runtime's JS division and remainder
    // (#3474, #3574).
    const helper = arithmeticHelper(op)
    if (helper) return `bf.${helper}(${l}, ${r})`
    const opMap: Record<string, string> = {
      '===': '==', '!==': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
      '+': '+', '-': '-', '*': '*',
    }
    return `${l} ${opMap[op] ?? op} ${r}`
  }

  logical(op: '&&' | '||' | '??', left: ParsedExpr, right: ParsedExpr, emit: (e: ParsedExpr) => string): string {
    const l = emit(left)
    const r = emit(right)
    // See the file header, divergence 1.
    if (op === '&&') return `(${r} if ${truthyTest(left, l)} else ${l})`
    if (op === '||') return `(${l} if ${truthyTest(left, l)} else ${r})`
    // See `JinjaFilterEmitter.logical`'s comment above (same file, same
    // fix): guard with `is defined` too, so a context var that was never
    // seeded (Jinja's `ChainableUndefined`, not Python `None`) still
    // coalesces to `r` instead of leaking the Undefined sentinel through.
    return `(${l} if (${l} is defined and ${l} is not none) else ${r})`
  }

  callbackMethod(
    method: string,
    object: ParsedExpr,
    arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
    restArgs: ParsedExpr[],
    emit: (e: ParsedExpr) => string,
  ): string {
    // The shared chain (`@barefootjs/jsx`'s `adapters/callback-method.ts`)
    // decides; this emitter only spells the result.
    const recv = emit(object)
    const plan = lowerCallbackMethod(method, arrow, restArgs, CALLBACK_LOWERING)
    switch (plan.kind) {
      case 'eval':
        return emitCallbackEval(plan, recv, emit, EVAL_SPELLING)
      case 'structured-sort':
        return renderSortMethod(recv, plan.comparator)
      case 'refuse':
        this.ctx._recordExprBF101(plan.message, plan.suggestion)
        return "''"
      default:
        // Unreachable: `receiver` needs a method outside `CALLBACK_METHODS`,
        // `native-predicate` an adapter with `nativePredicate`.
        return recv
    }
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
    const consequentStr = emit(consequent)
    const testStr = truthyTest(test, emit(test))
    return `(${consequentStr} if ${testStr} else ${emit(alternate)})`
  }

  templateLiteral(parts: TemplatePart[], emit: (e: ParsedExpr) => string): string {
    // `` `n=${count() + 1}` `` → Jinja string concatenation (`~`):
    // `'n=' ~ bf.string(count + 1)`. Every interpolated (non-string-literal)
    // segment routes through `bf.string(...)` before concatenation — Jinja's
    // `~` stringifies each operand with Python `str()`, which diverges from
    // JS `String(x)` for floats/booleans/None (see `jinja-adapter.ts`'s file
    // header, "Stringification").
    const terms: string[] = []
    for (const part of parts) {
      if (part.type === 'string') {
        if (part.value !== '') {
          terms.push(`'${escapeJinjaSingleQuoted(part.value)}'`)
        }
      } else {
        const rendered = emit(part.expr)
        const needsParens =
          part.expr.kind === 'binary' ||
          part.expr.kind === 'logical' ||
          part.expr.kind === 'conditional'
        terms.push(`bf.string(${needsParens ? `(${rendered})` : rendered})`)
      }
    }
    if (terms.length === 0) return `''`
    return terms.join(' ~ ')
  }

  arrow(_params: string[], _body: ParsedExpr): string {
    // A bare arrow never stands alone at a render position (it's only
    // meaningful as a callback, handled by `callbackMethod`). Emit the safe
    // empty-string literal so a stray emit can't produce a Jinja syntax
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

  objectLiteral(properties: ObjectLiteralProperty[], _raw: string, emit: (e: ParsedExpr) => string): string {
    // Reachable here in VALUE position (a `.map()` receiver/callback body, an
    // array-literal element, …) since `isSupportedValue` admits an object
    // literal whose every property value is itself supported
    // (expression-parser.ts, `checkSupport`'s `pos` parameter). Emit a Jinja
    // dict literal, keyed the same way `objectLiteralToJinjaDict` quotes the
    // spread-path literal.
    if (properties.length === 0) return '{}'
    const literalOf = (run: readonly Extract<ObjectLiteralProperty, { kind: 'prop' }>[]) =>
      `{${run.map(p => `${jinjaHashKey(p.key)}: ${emit(p.value)}`).join(', ')}}`
    if (!properties.some(p => p.kind === 'spread')) {
      return literalOf(properties as Extract<ObjectLiteralProperty, { kind: 'prop' }>[])
    }
    // Spread (`{ ...t, editing: false }`, #2696 Step 2): real Jinja2
    // (unlike minijinja) supports `**expr` kwargs-unpacking at a call site,
    // so `dict(base, **override)` — Python's own dict-merge idiom, which
    // Jinja2's `dict()` global mirrors exactly — folds ANY segment onto the
    // accumulator, later segments winning, matching JS spread left-to-right.
    const segments = groupObjectLiteralSegments(properties, literalOf, emit)
    return segments.reduce((acc, seg) => `dict(${acc}, **${seg.includes(' ') ? `(${seg})` : seg})`)
  }
}
