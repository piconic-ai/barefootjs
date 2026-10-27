/**
 * Member access and array-method lowering (#3425): the `ParsedExprEmitter`
 * arms that turn `object.property`, a higher-order callback method
 * (`items.filter(t => t.done)`, `.sort(cmp)`, `.reduce(fn, init)`) and a
 * non-callback array / string method (`.join(", ")`, `.slice(1)`,
 * `.trim()`) into Go-template pipelines.
 *
 * - {@link renderMember} lowers a member access.
 * - {@link renderCallbackMethod} lowers a callback method, pushing BF101
 *   for a shape with no Go template form.
 * - {@link renderArrayMethod} lowers a non-callback array or string method.
 *
 * The adapter's `member` / `callbackMethod` / `arrayMethod` emitter methods
 * delegate here over a {@link MemberAndMethodsHost}.
 */

import {
  sortComparatorFromArrow,
  type ArrayMethod,
  type HigherOrderMethod,
  type ParsedExpr,
  type SourceLocation,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import {
  emitBfSort,
  emitFlatMapEval,
  emitMapEval,
  emitReduceEval,
  emitSortEval,
  GO_REMEDIATION_OPTIONS,
  isElementIndex,
  wrapIfMultiToken,
} from '../lib/go-emit.ts'
import { goFieldNameForKey } from '../lib/go-naming.ts'
import type { HigherOrderShape } from '../lib/types.ts'

/**
 * What the member and array-method lowering needs from the adapter beyond
 * the shared {@link GoEmitContext}: the render position, the higher-order
 * callback renderers, the receiver classifiers and the root / props field
 * references. Kept out of `GoEmitContext` because only this module reads them.
 */
export interface MemberAndMethodsHost {
  readonly ctx: GoEmitContext
  /** A source location for a diagnostic. */
  makeLoc(): SourceLocation
  /** Whether the position being rendered is inside a `{{range}}`. */
  inLoop(): boolean
  /** Whether a loop row or callback binds `name` at the current position. */
  isBound(name: string): boolean
  /** The higher-order callback shape of a predicate method call, or null. */
  higherOrderShapeOf(node: ParsedExpr): HigherOrderShape | null
  /** `len (bf_filter …)` for `.filter(cb).length`, or null. */
  renderFilterLengthExpr(filterExpr: HigherOrderShape, renderArray: (e: ParsedExpr) => string): string | null
  /** The single-action form of a predicate callback method, or null. */
  renderHigherOrderExpr(expr: HigherOrderShape, renderArray: (e: ParsedExpr) => string): string | null
  /** The `{{range}}`/`{{break}}` block form of a `find*` callback, or null. */
  renderFindTemplateBlock(
    expr: HigherOrderShape,
    renderArray: (e: ParsedExpr) => string,
    propertyAccess?: string,
  ): string | null
  /** The `{{range}}` block form of an `every` / `some` callback, or null. */
  renderEverySomeTemplateBlock(expr: HigherOrderShape, renderArray: (e: ParsedExpr) => string): string | null
  /** The root field a `props.key` read names. */
  propKeyFieldRef(key: string): string
  /** A root field read, `$.`-prefixed inside a loop. */
  rootFieldRef(name: string): string
  /** Whether `node` is a member chain rooted in an object-default context. */
  isMapRootedContextChain(node: ParsedExpr): boolean
  /** Whether `node` is a member chain rooted in an inline-object-typed prop. */
  isMapRootedPropChain(node: ParsedExpr): boolean
  /** Whether `node` reads a member chain of a source-keyed signal seed map. */
  isMapSeededSignalChain(node: ParsedExpr): boolean
  /** A static `Const.key` / `Const["key"]` lookup on a module object literal, or null. */
  resolveStaticRecordLiteralIndex(jsExpr: string): string | null
  /** Whether `name` is the innermost loop item and a record (has fields). */
  isCurrentLoopRecord(name: string): boolean
  /** The nil-safe `bf_get` read of `property` on `object`. */
  renderOptionalMember(object: string, property: string): string
  /** An operand in an argument position (a template literal folds to `bf_concat_str`). */
  emitOperand(n: ParsedExpr, emit: (e: ParsedExpr) => string): string
}

/** Set of predicate (boolean-callback) higher-order methods. */
export const PREDICATE_METHODS: ReadonlySet<string> = new Set([
  'filter', 'find', 'findIndex', 'findLast', 'findLastIndex', 'every', 'some',
])

/**
 * The `ParsedExprEmitter.member` lowering: `object.property` (or
 * `object[property]` for a computed access) as a Go-template pipeline.
 */
export function renderMember(
  host: MemberAndMethodsHost,
  object: ParsedExpr,
  property: string,
  computed: boolean,
  optional: boolean,
  emit: (e: ParsedExpr) => string,
): string {
  const objHO = host.higherOrderShapeOf(object)
  const higherOrder = renderHigherOrderMemberRead(host, objHO, object, property, emit)
  if (higherOrder !== null) return higherOrder
  const bindingRead = renderBindingMemberRead(host, object, property, emit)
  if (bindingRead !== null) return bindingRead
  return renderFieldMemberRead(host, object, property, computed, optional, emit)
}

/**
 * The `.length` / `.find(...).prop` shortcuts over a higher-order callback
 * call and a memo-backed loop slice, or null when none applies.
 */
function renderHigherOrderMemberRead(
  host: MemberAndMethodsHost,
  objHO: HigherOrderShape | null,
  object: ParsedExpr,
  property: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  // .length on a `.filter(...)` callback call → len (bf_filter ...)
  if (property === 'length' && objHO) {
    const result = host.renderFilterLengthExpr(objHO, emit)
    if (result) return result
  }

  // `<memo>().length` where the memo's `.map()` feeds a handler-filled loop
  // slice → `len .<Slice>` (`visible().length` → `len .PostListItems`). The
  // slice holds the rendered (filtered) items, so its length is the count —
  // unlike the memo's own field, which is unset.
  if (
    property === 'length' &&
    object.kind === 'call' &&
    object.callee.kind === 'identifier' &&
    object.args.length === 0
  ) {
    const slice = host.ctx.state.memoBackedLoopSlice.get(object.callee.name)
    if (slice) {
      // Root field, so reach it through `$.` inside a loop.
      const prefix = host.inLoop() ? '$.' : '.'
      return `len ${prefix}${slice}`
    }
  }

  // find().property / findLast().property → {{with bf_find ...}}{{.Property}}{{end}}
  if (objHO && (objHO.method === 'find' || objHO.method === 'findLast')) {
    const findResult = host.renderHigherOrderExpr(objHO, emit)
    if (findResult) {
      return `{{with ${findResult}}}{{.${goFieldNameForKey(property)}}}{{end}}`
    }
    const templateBlock = host.renderFindTemplateBlock(
      objHO, emit, goFieldNameForKey(property),
    )
    if (templateBlock) return templateBlock
  }

  return null
}

/**
 * A read off a props object, the rest bag, a map-rooted context chain or a
 * module object-literal const, or null when the receiver is none of those.
 */
function renderBindingMemberRead(
  host: MemberAndMethodsHost,
  object: ParsedExpr,
  property: string,
  emit: (e: ParsedExpr) => string,
): string | null {
  // SolidJS-style props pattern: props.xxx -> .Xxx (or $.Xxx inside a loop,
  // since props live on the root data struct, not the iteration element).
  if (object.kind === 'identifier' && host.ctx.state.propsObjectName && object.name === host.ctx.state.propsObjectName) {
    return host.propKeyFieldRef(property)
  }

  // A member access on the component's own destructured rest binding
  // (`function({ children, ...rest }) { ... rest.header ... }`) reads off
  // the rest-bag's `map[string]any` field (#2805) — case-tolerant
  // `bf_get`, the same route `isMapRootedPropChain` below uses for an
  // inline-object-typed prop, since a source-cased key is what both the
  // static bake (`emitChildField`) and the dynamic-delivery route
  // (`queueDynamicPropDefine`) write. `scope.isBound` guards against an
  // INNER `.map(({ ...rest }) => ...)` binding of the same name shadowing
  // the outer rest bag (the shared shadow-guard predicate — see
  // `spec/compiler.md`'s `BindingScope` section).
  if (
    object.kind === 'identifier' &&
    host.ctx.state.restPropsName &&
    object.name === host.ctx.state.restPropsName &&
    !host.isBound(object.name)
  ) {
    return `bf_get ${host.rootFieldRef(object.name)} ${JSON.stringify(property)}`
  }

  // A member chain rooted in a `useContext` local whose `createContext`
  // default is object-shaped (#2087 — `defaultKind === 'object'`) reads off
  // a `map[string]interface{}` field, not a struct: plain Go template dot
  // access (`.Ctx.Config`) does an EXACT-string `MapIndex`, so it would
  // only resolve a capitalized key the provider never bakes (see
  // `providerObjectValueToGoMap`, which keeps SOURCE/JS-cased keys). Route
  // through `bf_get` (the runtime's case-tolerant `getFieldValue`, bf.go)
  // instead, recursively — once a chain is map-rooted every further
  // `.property` is ALSO opaque (the map's value type is `interface{}`, so
  // there's no static struct to fall back to), hence checking the object
  // rather than just the top-level identifier.
  if (host.isMapRootedContextChain(object)) {
    const objGo = emit(object)
    return `bf_get ${wrapIfMultiToken(objGo)} ${JSON.stringify(property)}`
  }

  // Static property access on a module object-literal const
  // (`variantClasses.ghost` in a class template literal) resolves at compile
  // time — same lookup as the bracket-index form in
  // `resolveStaticRecordLiteralIndex`, reached here when the access is nested
  // inside a larger ParsedExpr tree.
  if (object.kind === 'identifier') {
    const staticValue = host.resolveStaticRecordLiteralIndex(
      `${object.name}.${property}`,
    )
    if (staticValue !== null) return staticValue
  }

  return null
}

/** A field or element read off the rendered receiver. */
function renderFieldMemberRead(
  host: MemberAndMethodsHost,
  object: ParsedExpr,
  property: string,
  computed: boolean,
  optional: boolean,
  emit: (e: ParsedExpr) => string,
): string {
  // A numeric index (`row[0]`, `pair[1]`, #3497) reads an element, not a
  // struct field: `.Field0` is no field of a `[]string`, and html/template
  // fails the render. It takes the `bf_get` arm below (the row itself
  // rendering as `.`), which indexes a slice and still finds a map key or
  // a generated struct's JSON-tagged field spelled the same, as JS
  // `obj[0]` reads `obj["0"]`.
  const elementIndex = isElementIndex(computed, property)
  // Inside a loop, the loop param variable refers to the current item
  // (dot). e.g. `msg.role` inside `{{range $_, $msg := .Messages}}` → `.Role`
  //
  // Field names route through `goFieldNameForKey` — the same sanitizer the
  // struct/map bake side uses — NOT bare `capitalizeFieldName`: a
  // non-identifier property (`meta["data-x"]`, parsed as computed member
  // access) would otherwise emit `.Data-x`, which is not even valid Go
  // template syntax, let alone a reachable field (PR #2089 review). For
  // identifier keys (snake_case included) the two functions agree, so
  // nothing previously reachable changes shape.
  if (object.kind === 'identifier' && host.isCurrentLoopRecord(object.name) && !elementIndex) {
    return `.${goFieldNameForKey(property)}`
  }

  const obj = emit(object)
  // JS `.length`: array element count OR, for a string, UTF-16 code-unit
  // count (#2255) — NOT Go's native `len`, which is byte count for a
  // string. `Length`/`bf_length` (bf.go) dispatches on the runtime value's
  // shape to match. The specialized array-only `.length` shapes above
  // (filter-result count, memo-backed loop slice count) stay on `len`,
  // since arrays never hit the UTF-16 divergence.
  if (property === 'length') {
    const read = `bf_length ${wrapIfMultiToken(obj)}`
    // `x?.length` (#3332) is `undefined` for an absent receiver, not
    // `bf_length nil`'s 0: a bare read renders empty (html/template prints
    // a nil value as nothing) and a `??` fallback takes over. `bf_eq`
    // treats a typed nil (an absent slice) as nil.
    return optional ? `bf_ternary (bf_eq ${wrapIfMultiToken(obj)} nil) nil (${read})` : read
  }
  // A `?.`-written access (`user?.name`, #2168 optional-chaining-prop):
  // a plain `.Field` dot-chain panics evaluating a field on a nil
  // interface/pointer (`nil pointer evaluating interface {}.Name`), so
  // route through the runtime's existing nil-safe reflection-based
  // getter instead — `bf_get`/`getFieldValue` (bf.go), already used for
  // map-rooted context chains above, guards the nil case and returns Go
  // `nil` (which `or`/`bf.truthy?`-style fallbacks treat as falsy) —
  // preserve the source key so computed indices and punctuation are not
  // rewritten. The getter also handles Go struct casing. Only guards the
  // single written `?.` hop, not
  // a JS-style whole-chain short-circuit — see the `ParsedExpr` `member`
  // variant's docstring for the multi-hop caveat.
  //
  // A plain member access rooted in an inline-object-typed prop
  // (`props.cfg.id`, #2299) reads off a `map[string]interface{}` field:
  // route through the case-tolerant `bf_get` with the JS-cased key (the map
  // is baked with source-cased keys), not the exact-case `.Cfg.ID` dot path
  // below that would `MapIndex("ID")` a `"id"` map and render empty. Placed
  // after the `length` special case so it only intercepts the otherwise-
  // untyped dot access. A numeric index takes the same getter (see
  // `elementIndex` above).
  if (optional || elementIndex || host.isMapRootedPropChain(object) || host.isMapSeededSignalChain(object)) {
    return host.renderOptionalMember(obj, property)
  }
  return `${obj}.${goFieldNameForKey(property)}`
}


/**
 * Push BF101 for a callback method whose shape has no Go template form.
 *
 * `selfContained` callbacks (`reduce` / `flatMap` off the eval-lowerable
 * catalogue — a `.reduce` with no init, a tuple `.flatMap` with a non-leaf
 * element) carry the self-contained "no SSR" remedy and must NOT get the
 * generic Options block appended (mirrors `isSupported`'s `selfContained`
 * flag for `UNSUPPORTED_METHODS`). Predicate callbacks that exhaust their
 * template-block fallbacks keep the generic Options remediation.
 */
function pushCallbackBF101(host: MemberAndMethodsHost, method: string, selfContained = false): string {
  host.ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `Higher-order method '.${method}' shape cannot be lowered to a Go template action`,
    loc: host.makeLoc(),
    suggestion: {
      message: selfContained
        ? `'${method}()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).`
        : GO_REMEDIATION_OPTIONS,
    },
  })
  return `""`
}

/**
 * The `ParsedExprEmitter.callbackMethod` lowering: a higher-order array
 * method with an arrow callback (`filter` / `find` / `sort` / `reduce` / …).
 */
export function renderCallbackMethod(
  host: MemberAndMethodsHost,
  method: string,
  object: ParsedExpr,
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
  restArgs: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  const recv = emit(object)

  if (PREDICATE_METHODS.has(method)) {
    return renderPredicateCallback(host, method, object, arrow, emit)
  }

  return renderValueCallback(host, method, recv, arrow, restArgs, emit)
}

/** A predicate callback method (`filter` / `find*` / `every` / `some`). */
function renderPredicateCallback(
  host: MemberAndMethodsHost,
  method: string,
  object: ParsedExpr,
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
  emit: (e: ParsedExpr) => string,
): string {
  const body = arrow.body
  const params = arrow.params

  const shape: HigherOrderShape = {
    method: method as HigherOrderMethod,
    object,
    param: params[0] ?? '_',
    predicate: body,
  }
  const result = host.renderHigherOrderExpr(shape, emit)
  if (result) return result
  if (
    method === 'find' || method === 'findIndex' ||
    method === 'findLast' || method === 'findLastIndex'
  ) {
    const templateBlock = host.renderFindTemplateBlock(shape, emit)
    if (templateBlock) return templateBlock
  }
  if (method === 'every' || method === 'some') {
    const templateBlock = host.renderEverySomeTemplateBlock(shape, emit)
    if (templateBlock) return templateBlock
  }
  return pushCallbackBF101(host, method)
}

/** A value-producing callback method (`sort` / `reduce` / `flatMap` / `map` / …). */
function renderValueCallback(
  host: MemberAndMethodsHost,
  method: string,
  recv: string,
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
  restArgs: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  const body = arrow.body
  const params = arrow.params

  if (method === 'sort' || method === 'toSorted') {
    // Evaluator-first (#2018): the comparator body is serialized and evaluated
    // per comparison. Falls back to the structured `bf_sort` for a comparator
    // the evaluator can't model (e.g. localeCompare).
    const evalForm = emitSortEval(recv, body, params, emit)
    if (evalForm !== null) return evalForm
    const cmp = sortComparatorFromArrow(arrow)
    if (cmp !== null) return emitBfSort(recv, cmp)
    return pushCallbackBF101(host, method)
  }

  if (method === 'reduce' || method === 'reduceRight') {
    // `.reduce(fn, init)` / `.reduceRight(fn, init)` fold via the evaluator.
    // The arithmetic-fold catalogue always serializes, so there's no
    // structured fallback — a body / init the evaluator can't model is BF101.
    const direction = method === 'reduceRight' ? 'right' : 'left'
    const init = restArgs[0]
    if (init) {
      const evalForm = emitReduceEval(recv, body, params, init, direction, emit)
      if (evalForm !== null) return evalForm
    }
    return pushCallbackBF101(host, method, true)
  }

  if (method === 'flatMap') {
    const evalForm = emitFlatMapEval(recv, body, params[0] ?? '_', emit)
    if (evalForm !== null) return evalForm
    return pushCallbackBF101(host, method, true)
  }

  // Value-producing `.map(cb)` (#2073): eval-only. (The JSX-returning
  // `.map` is an IRLoop upstream and never reaches this dispatch.)
  if (method === 'map') {
    const evalForm = emitMapEval(recv, body, params[0] ?? '_', emit)
    if (evalForm !== null) return evalForm
    return pushCallbackBF101(host, method, true)
  }

  return pushCallbackBF101(host, method, true)
}

/**
 * The `ParsedExprEmitter.arrayMethod` lowering: a non-callback array or
 * string method (`join` / `slice` / `trim` / `replace` / …) as its `bf_*`
 * runtime helper call.
 */
export function renderArrayMethod(
  host: MemberAndMethodsHost,
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  rawEmit: (e: ParsedExpr) => string,
): string {
  // Every `emit(...)` call below lowers an ARGUMENT position (the
  // receiver or a `.method(...)` arg) that feeds a prefix-call Go form
  // (`bf_join (...) ...`, `bf_replace ... ... ...`, …) — shadow the
  // dispatcher's own `emit` with `emitOperand` (#2863) so a
  // template-literal receiver/argument (e.g. `items.join(\`${a}-${b}\`)`)
  // folds through `bf_concat_str` instead of leaking the TEXT-position
  // `templateLiteral()` form into another action's argument list.
  const emit = (e: ParsedExpr): string => host.emitOperand(e, rawEmit)
  // `bf_join` etc. are registered in the runtime FuncMap. The exhaustive
  // switch on `method` mirrors the IR-level discriminator — adding a new
  // `ArrayMethod` variant becomes a TS compile error until every adapter
  // declares its lowering.
  switch (method) {
    case 'join':
    case 'includes':
    case 'indexOf':
    case 'lastIndexOf':
    case 'at':
    case 'concat':
    case 'slice':
    case 'reverse':
    case 'toReversed':
      return renderCollectionMethod(method, object, args, emit)
    case 'toLowerCase':
    case 'toUpperCase':
    case 'trim':
    case 'trimStart':
    case 'trimEnd':
    case 'toFixed':
    case 'split':
      return renderStringTransformMethod(method, object, args, emit)
    case 'startsWith':
    case 'endsWith':
    case 'replace':
    case 'replaceAll':
    case 'repeat':
    case 'padStart':
    case 'padEnd':
      return renderStringArgMethod(method, object, args, emit)
    default: {
      const _exhaustive: never = method
      throw new Error(`Go arrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`)
    }
  }
}

/** The array-shaped methods of {@link renderArrayMethod}. */
function renderCollectionMethod(
  method: Extract<ArrayMethod, 'join' | 'includes' | 'indexOf' | 'lastIndexOf' | 'at' | 'concat' | 'slice' | 'reverse' | 'toReversed'>,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      const obj = emit(object)
      // `.join()` defaults the separator to `,`; extra arguments are ignored.
      const sep = args.length >= 1 ? emit(args[0]) : '","'
      // Paren-wrap a multi-token separator so Go template doesn't fold its
      // tokens into `bf_join`'s argument list.
      return `bf_join (${obj}) ${wrapIfMultiToken(sep)}`
    }
    case 'includes': {
      // Both `arr.includes(x)` and `str.includes(sub)` route here — the parser
      // can't disambiguate the receiver type. The runtime `Includes` helper
      // inspects `reflect.Kind()`: slices/arrays use DeepEqual element search,
      // strings use `strings.Contains`.
      const obj = emit(object)
      const needle = emit(args[0])
      return `bf_includes ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      // Value-equality search (DeepEqual), for the bare `.indexOf(x)` /
      // `.lastIndexOf(x)` shape with no `.field` accessor on the elements
      // (unlike `bf_find_index`, which keys on struct-field equality).
      const fn = method === 'indexOf' ? 'bf_index_of' : 'bf_last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `${fn} ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(needle)}`
    }
    case 'at': {
      // `.at(i)` supports negative indices (`.at(-1)` → last element). No
      // argument is `.at(0)`; extra arguments are ignored.
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `bf_at ${wrapIfMultiToken(obj)} ${wrapIfMultiToken(idx)}`
    }
    case 'concat': {
      // `.concat(other)` merges two arrays; `bf_concat` reflects over both
      // operands so callers can mix `[]string` + `[]any` etc. `.concat()` with
      // no argument is a shallow copy, indistinguishable from the receiver in
      // an SSR snapshot, so it lowers to the receiver.
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `bf_concat ${wrapIfMultiToken(a)} ${wrapIfMultiToken(b)}`
    }
    case 'slice': {
      // `.slice()` / `.slice(start)` / `.slice(start, end)`. Missing `start`
      // defaults to 0; an absent `end` means "to length". Out-of-bounds
      // indices clamp (JS-compat); `start > end` returns empty. Only
      // `args[0]` / `args[1]` are read.
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      if (args.length <= 1) {
        return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)}`
      }
      const end = emit(args[1])
      return `bf_slice ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(start)} ${wrapIfMultiToken(end)}`
    }
    case 'reverse':
    case 'toReversed': {
      // SSR renders a state snapshot, so JS's mutate-receiver (`reverse`) vs
      // return-new (`toReversed`) distinction has no template-level meaning.
      // Both route through `bf_reverse`, which always returns a fresh `[]any`.
      const recv = emit(object)
      return `bf_reverse ${wrapIfMultiToken(recv)}`
    }
  }
}

/** The receiver-only string / number methods of {@link renderArrayMethod}. */
function renderStringTransformMethod(
  method: Extract<ArrayMethod, 'toLowerCase' | 'toUpperCase' | 'trim' | 'trimStart' | 'trimEnd' | 'toFixed' | 'split'>,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'toLowerCase': {
      const recv = emit(object)
      return `bf_lower ${wrapIfMultiToken(recv)}`
    }
    case 'toUpperCase': {
      const recv = emit(object)
      return `bf_upper ${wrapIfMultiToken(recv)}`
    }
    case 'trim': {
      const recv = emit(object)
      return `bf_trim ${wrapIfMultiToken(recv)}`
    }
    case 'trimStart':
    case 'trimEnd': {
      // `.trimStart()` / `.trimEnd()` — the one-sided siblings of `.trim()`
      // (#2183 follow-up). Dedicated `bf_trim_start` / `bf_trim_end`
      // helpers, not `bf_trim` with a flag.
      const fn = method === 'trimStart' ? 'bf_trim_start' : 'bf_trim_end'
      const recv = emit(object)
      return `${fn} ${wrapIfMultiToken(recv)}`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` → `bf_to_fixed` (`fmt.Sprintf("%.*f", …)`); default
      // 0 digits when the argument is omitted.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `bf_to_fixed ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(digits)}`
    }
    case 'split': {
      // `.split()` / `.split(sep)` / `.split(sep, limit)` — string → `[]any`.
      // No separator → the whole string as a single element (`bf_arr`).
      // Otherwise `bf_split`; a second `limit` argument caps the pieces. A
      // third+ argument is ignored.
      const recv = emit(object)
      if (args.length === 0) {
        return `bf_arr ${wrapIfMultiToken(recv)}`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `bf_split ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(sep)}`
      }
      const limit = emit(args[1])
      return `bf_split ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(sep)} ${wrapIfMultiToken(limit)}`
    }
  }
}

/** The argument-taking string methods of {@link renderArrayMethod}. */
function renderStringArgMethod(
  method: Extract<ArrayMethod, 'startsWith' | 'endsWith' | 'replace' | 'replaceAll' | 'repeat' | 'padStart' | 'padEnd'>,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'startsWith':
    case 'endsWith': {
      // `.startsWith(prefix, position?)` / `.endsWith(suffix, endPosition?)` —
      // string → boolean via `bf_starts_with` / `bf_ends_with`. The optional
      // second argument re-anchors the test; a third+ argument is ignored.
      const fn = method === 'startsWith' ? 'bf_starts_with' : 'bf_ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      const base = `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(arg)}`
      if (args.length >= 2) {
        return `${base} ${wrapIfMultiToken(emit(args[1]))}`
      }
      return base
    }
    case 'replace': {
      // `.replace(old, new)` — string-pattern form, first occurrence only, via
      // `bf_replace` (`strings.Replace` with n=1). The regex-pattern form is
      // refused upstream at the parser.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf_replace ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(oldS)} ${wrapIfMultiToken(newS)}`
    }
    case 'replaceAll': {
      // `.replaceAll(old, new)` — string-pattern form, EVERY occurrence, via
      // `bf_replace_all` (`strings.ReplaceAll`). A dedicated helper, not
      // `bf_replace` with a different n — the regex-pattern form is refused
      // upstream at the parser, same as `.replace`.
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `bf_replace_all ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(oldS)} ${wrapIfMultiToken(newS)}`
    }
    case 'repeat': {
      // `.repeat(n)` — string repeated `n` times. `bf_repeat` clamps a negative
      // count to "" instead of letting `strings.Repeat` panic. No argument is
      // `repeat(0)` → ""; a second+ argument is ignored.
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `bf_repeat ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(count)}`
    }
    case 'padStart':
    case 'padEnd': {
      // `.padStart(target, pad?)` / `.padEnd(target, pad?)` — pad to `target`
      // runes with `pad` (default a single space, supplied by the variadic
      // helper). No argument is `padStart(0)` → the receiver unchanged; a
      // third+ argument is ignored.
      const fn = method === 'padStart' ? 'bf_pad_start' : 'bf_pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `${fn} ${wrapIfMultiToken(recv)} 0`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(target)}`
      }
      const pad = emit(args[1])
      return `${fn} ${wrapIfMultiToken(recv)} ${wrapIfMultiToken(target)} ${wrapIfMultiToken(pad)}`
    }
  }
}
