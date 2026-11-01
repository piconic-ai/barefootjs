/**
 * A component- or module-scope `const` computed from props, signals or other
 * consts (`const cls = 'btn ' + variant`, `const twice = props.n * 2`) has no
 * binding in a template: the backend receives the props, not the
 * component's locals. Every template adapter read such a const as a template
 * variable nothing defines, so it rendered empty, a prop of the same name, or
 * failed the render (#3494).
 *
 * `inlineComputedConsts` substitutes each such read with the const's
 * initializer tree, exactly as if the source had written the expression in
 * place; the adapter then lowers it like any other expression, refusing what
 * it cannot lower (`Object.keys(labels)` has no template form, BF101) instead
 * of reading an unbound name. The substitution is structural
 * (`inlineBinding`), so precedence, string literals and callback params that
 * shadow the name are respected.
 */

import { collectContextConsumers, lookupLiteralConst, resolveStaticConstBinding } from '../augment-inherited-props.ts'
import { freeIdentifiers, inlineBinding, mapParsedExpr, parseExpression, stringifyParsedExpr, type ParsedExpr } from '../expression-parser.ts'
import type { ConstantInfo, ExpressionAttr, IRMetadata, ParamInfo } from '../types.ts'
import { componentBindings } from '../relocate.ts'
import { PROPS_OBJECT_IDENTIFIER } from '../scope/binding-scope.ts'

export interface ComputedConstContext {
  constants: IRMetadata['localConstants'] | undefined
  /** Signal getters and memo names: the zero-arg calls a template reads as values. */
  getters: ReadonlySet<string>
  /** Context consumers (`const theme = useContext(ThemeContext)`), which the adapter seeds itself. */
  contextConsumers: ReadonlySet<string>
  /** Consts a props destructure binds, which the adapter binds as props params. */
  propsBindings: ReadonlySet<string>
  /**
   * Component-scope names that hold a prop as passed, with the prop's
   * caller-facing key: a destructured signature param (`{ children: kids }`
   * → `kids` → `children`) or a props destructure const. Empty when the
   * props object identifier names something else.
   */
  propReads: ReadonlyMap<string, string>
  /** Component-scope local functions, which shadow a module const of the same name. */
  localFunctions: ReadonlySet<string>
  /**
   * Names the component scope lexically binds (the props object, destructured
   * and rest props, its consts, local functions, signals, memos), which
   * shadow a module binding of the same name. A module const's initializer
   * never reads one of them. A prop reachable only through the props object
   * (`function C(props: { label: string })`) binds no name.
   */
  componentNames: ReadonlySet<string>
  /** The component's props params and props object name, which type an index read (`keyedValue`). */
  props: { params: readonly ParamInfo[]; objectName: string | null }
  /** Whether a loop row or callback binds `name` where the expression is read. */
  isShadowed(name: string): boolean
  /** Whether the adapter binds the const `name` itself, so a read of it stays as written. */
  isAdapterBound(name: string): boolean
  /**
   * Whether `name` read where the expression is read is a JavaScript global:
   * bound by neither the component nor its module (`componentBindings`), nor
   * the rest props, nor an enclosing loop or callback.
   */
  isGlobal(name: string): boolean
}

/** The {@link ComputedConstContext} fields that come from the component's metadata. */
export function computedConstContext(
  metadata: IRMetadata,
  isShadowed: (name: string) => boolean,
  isAdapterBound: (name: string) => boolean = () => false,
): ComputedConstContext {
  const bindings = componentBindings(metadata)
  return {
    constants: metadata.localConstants,
    getters: new Set([...metadata.signals.map(s => s.getter), ...metadata.memos.map(m => m.name)]),
    contextConsumers: new Set(collectContextConsumers(metadata).map(c => c.localName)),
    propsBindings: propsBindingNames(metadata),
    propReads: propReadKeys(metadata, bindings),
    localFunctions: new Set(metadata.localFunctions.filter(f => !f.isModule).map(f => f.name)),
    componentNames: componentScopeNames(metadata),
    props: { params: metadata.propsParams, objectName: metadata.propsObjectName },
    isShadowed,
    isAdapterBound,
    isGlobal: name => !bindings.has(name) && name !== metadata.restPropsName && !isShadowed(name),
  }
}

/**
 * Consts a props destructure binds (`const { label: text = 'none' } = props`).
 * The analyzer records each as a props param, renamed and defaulted, and the
 * adapters bind it as one: its default applies to `undefined` alone, which
 * the `??` of its recorded value would not keep on a backend whose `??`
 * also tests `''`. A const merely named like a prop
 * (`const label = props.label ?? 'Default'`, the prop itself carrying no
 * default) is not one.
 */
function propsBindingNames(metadata: IRMetadata): Set<string> {
  const names = new Set<string>()
  const props = metadata.propsObjectName
  if (!props) return names
  for (const constant of metadata.localConstants ?? []) {
    const param = metadata.propsParams.find(p => p.name === constant.name)
    const value = constant.value?.trim()
    if (!param || value === undefined) continue
    const read = `${props}.${param.sourceName ?? param.name}`
    if (value === read || (param.defaultValue !== undefined && value === `${read} ?? ${param.defaultValue}`)) {
      names.add(constant.name)
    }
  }
  return names
}

/**
 * {@link ComputedConstContext.componentNames}. Not `componentBindings`, which
 * also lists every typed prop of a props object as a `prop` binding.
 */
export function componentScopeNames(
  metadata: Pick<IRMetadata, 'propsObjectName' | 'propsParams' | 'restPropsName' | 'localConstants' | 'localFunctions' | 'signals' | 'memos'>,
): Set<string> {
  const names = new Set<string>()
  if (metadata.propsObjectName !== null) names.add(metadata.propsObjectName)
  // With no props object the signature destructures, so every param is bound.
  else for (const p of metadata.propsParams) names.add(p.name)
  if (metadata.restPropsName) names.add(metadata.restPropsName)
  for (const c of metadata.localConstants) if (!c.isModule) names.add(c.name)
  for (const f of metadata.localFunctions) if (!f.isModule) names.add(f.name)
  for (const s of metadata.signals) {
    if (s.isModule) continue
    names.add(s.getter)
    if (s.setter) names.add(s.setter)
  }
  for (const m of metadata.memos) if (!m.isModule) names.add(m.name)
  return names
}

/**
 * {@link ComputedConstContext.propReads}: each component-scope name bound to
 * a prop as passed, with the prop's key, so a read of it can be spelled
 * `props.<key>` where a loop row or callback shadows the name. A template
 * reads that as the prop's own variable, which holds a destructure default
 * already. Only when the props object identifier `props` names the props
 * object or nothing in the component, so the spelling cannot read another
 * binding.
 */
function propReadKeys(metadata: IRMetadata, bindings: ReadonlyMap<string, unknown>): Map<string, string> {
  const reads = new Map<string, string>()
  const propsObject = metadata.propsObjectName
  // Under another props object name (`function C(p)`) the adapters do not
  // agree on what a read of `props` is, so no prop read is respelled.
  if (propsObject === null ? bindings.has(PROPS_OBJECT_IDENTIFIER) : propsObject !== PROPS_OBJECT_IDENTIFIER) return reads
  const destructures = propsBindingNames(metadata)
  for (const param of metadata.propsParams) {
    if (param.isRest) continue
    // A signature that names the props object binds no param locally; only
    // a props destructure const does.
    if (propsObject !== null && !destructures.has(param.name)) continue
    if (bindings.get(param.name) !== 'prop') continue
    reads.set(param.name, param.sourceName ?? param.name)
  }
  return reads
}

/** Upper bound on const-of-const chains, a guard against a malformed cycle. */
const MAX_DEPTH = 16

/**
 * `expr` with each read of a computed const replaced by its initializer,
 * repeated so a const read inside an initializer is replaced too.
 */
export function inlineComputedConsts(expr: ParsedExpr, ctx: ComputedConstContext | null): ParsedExpr {
  if (!ctx?.constants?.length) return expr
  let current = expr
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const next = inlineOnce(current, ctx)
    if (next === current) return current
    current = next
  }
  return current
}

function inlineOnce(expr: ParsedExpr, ctx: ComputedConstContext): ParsedExpr {
  const free = freeIdentifiers(expr)
  if (!free) return expr
  let result = expr
  for (const name of free) {
    const object = objectConstInitializer(name, ctx)
    if (object) {
      result = projectObjectReads(result, name, object, ctx) ?? result
      continue
    }
    const init = inlinableInitializer(name, ctx)
    if (!init) continue
    result = inlineBinding(result, name, init) ?? inlineUnderCallbacks(result, name, init, ctx) ?? result
  }
  return result
}

/**
 * {@link inlineBinding} for an initializer a callback param inside `expr`
 * would capture (`rows.filter(a => a !== b)` with `const b = a`): the
 * initializer resolved in the component scope first
 * ({@link resolveInComponentScope}), so none of its free names is one the
 * expression's callbacks bind.
 */
function inlineUnderCallbacks(expr: ParsedExpr, name: string, init: ParsedExpr, ctx: ComputedConstContext): ParsedExpr | null {
  const params = arrowParamNames(expr)
  if (params.size === 0) return null
  const resolved = resolveInComponentScope(init, ctx, n => params.has(n) || ctx.isShadowed(n))
  return resolved ? inlineBinding(expr, name, resolved) : null
}

/** Every param name an arrow anywhere in `expr` binds. */
function arrowParamNames(expr: ParsedExpr): Set<string> {
  const names = new Set<string>()
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const e = node as ParsedExpr
    if (e.kind === 'arrow') for (const p of e.params) names.add(p)
    for (const value of Object.values(e)) visit(value)
  }
  visit(expr)
  return names
}

/** The scope a const's initializer is written in, which its free names resolve against. */
type InitScope = 'component' | 'module'

/**
 * `init`, an initializer written in `scope`, with each free name replaced
 * where reading it at the use site would reach a different binding: one
 * `captured` holds there (a loop row or callback binds it), or, for a module
 * const's initializer, one the component scope binds. The name becomes what
 * it holds in `scope`: a computed or literal const its own initializer,
 * resolved the same way (`const a = children; const b = a` read in
 * `rows.map(a => …{b}…)` reads `children`), and a component-scope prop
 * binding `props.<key>`, which the adapters read as the prop wherever a row
 * rebinds its bare name (#3696). `null` when such a name holds anything
 * else, or when `props` itself is captured.
 */
function resolveInitializer(
  init: ParsedExpr,
  ctx: ComputedConstContext,
  captured: (name: string) => boolean,
  scope: InitScope,
  depth = 0,
): ParsedExpr | null {
  const free = freeIdentifiers(init)
  if (!free || depth >= MAX_DEPTH) return null
  let result = init
  for (const name of free) {
    if (!captured(name) && !(scope === 'module' && ctx.componentNames.has(name))) continue
    const value = scope === 'module' ? moduleScopeValue(name, ctx, captured, depth) : componentScopeValue(name, ctx, captured, depth)
    const next = value ? inlineBinding(result, name, value) : null
    if (!next) return null
    result = next
  }
  return result
}

/** {@link resolveInitializer} for an initializer written in the component scope. */
function resolveInComponentScope(init: ParsedExpr, ctx: ComputedConstContext, captured: (name: string) => boolean): ParsedExpr | null {
  return resolveInitializer(init, ctx, captured, 'component')
}

/** What the component-scope name `name` holds, for {@link resolveInitializer}. */
function componentScopeValue(
  name: string,
  ctx: ComputedConstContext,
  captured: (name: string) => boolean,
  depth: number,
): ParsedExpr | null {
  if (ctx.getters.has(name) || ctx.contextConsumers.has(name) || ctx.localFunctions.has(name)) return null
  if (ctx.isAdapterBound(name)) return null
  const key = ctx.propReads.get(name)
  if (key !== undefined) {
    if (captured(PROPS_OBJECT_IDENTIFIER)) return null
    return { kind: 'member', object: { kind: 'identifier', name: PROPS_OBJECT_IDENTIFIER }, property: key, computed: false, optional: false }
  }
  // Any other component binding of the name is not a const this can read.
  if (ctx.componentNames.has(name) && !componentConst(name, ctx)) return null
  return constValue(componentConst(name, ctx) ?? moduleConst(name, ctx), ctx, captured, depth)
}

/**
 * What the module-scope name `name` holds, for {@link resolveInitializer}:
 * only a module const, whatever the component scope binds by that name.
 * `isAdapterBound` names a component-scope binding, so it does not apply.
 */
function moduleScopeValue(
  name: string,
  ctx: ComputedConstContext,
  captured: (name: string) => boolean,
  depth: number,
): ParsedExpr | null {
  return constValue(moduleConst(name, ctx), ctx, captured, depth)
}

/** A const's initializer resolved in the scope it is declared in, or `null` when it is not one a template can inline. */
function constValue(
  constant: ConstantInfo | undefined,
  ctx: ComputedConstContext,
  captured: (name: string) => boolean,
  depth: number,
): ParsedExpr | null {
  const init = constant?.parsed
  // A props destructure const is the component's; a module const of that name is not one.
  if (!constant || !init || (!constant.isModule && ctx.propsBindings.has(constant.name))) return null
  const literal = lookupLiteralConst(constant.name, [constant], () => false) !== null
  if (!literal && !(isPlainComputedConst(constant, init) && callsOnlyGetters(init, constant.isModule ? new Set() : ctx.getters))) return null
  return resolveInitializer(init, ctx, captured, constant.isModule ? 'module' : 'component', depth + 1)
}

/** The component-scope const `name`. */
function componentConst(name: string, ctx: ComputedConstContext): ConstantInfo | undefined {
  return ctx.constants?.find(c => c.name === name && !c.isModule)
}

/** The module-scope const `name`. */
function moduleConst(name: string, ctx: ComputedConstContext): ConstantInfo | undefined {
  return ctx.constants?.find(c => c.name === name && c.isModule)
}

/**
 * An `{expr}` attribute value read through {@link inlineComputedConsts}, so
 * the attribute's own plan (a nullable prop read drops the attribute) sees
 * the const's initializer, not its name: `title={label}` with
 * `const label = props.label ?? 'Default'` is not a bare read of `label`.
 */
export function inlineComputedConstAttr(value: ExpressionAttr, ctx: ComputedConstContext | null): ExpressionAttr {
  if (!ctx) return value
  const parsed = value.parsed ?? parseExpression(value.expr.trim())
  const inlined = inlineComputedConsts(parsed, ctx)
  if (inlined === parsed) return value
  // `templateExpr` and `parts` are derived from the original `expr`; dropped
  // so no consumer reads the const's name through them.
  return { ...value, expr: stringifyParsedExpr(inlined), parsed: inlined, templateExpr: undefined, parts: undefined }
}

/** The initializer of a const read `name` stands for, or `null` when the read stays as it is. */
function inlinableInitializer(name: string, ctx: ComputedConstContext): ParsedExpr | null {
  // A component-scope binding of the name shadows a module const.
  const constant = componentConst(name, ctx) ?? (ctx.componentNames.has(name) ? undefined : moduleConst(name, ctx))
  const init = constant?.parsed
  if (!constant || !init || !isPlainComputedConst(constant, init)) return null
  if (ctx.isShadowed(name) || ctx.getters.has(name) || ctx.contextConsumers.has(name) || ctx.propsBindings.has(name)) return null
  if (ctx.isAdapterBound(name)) return null
  // An adapter already inlines a literal const in its own syntax.
  if (lookupLiteralConst(name, [constant], ctx.isShadowed) !== null) return null
  if (!callsOnlyGetters(init, ctx.getters)) return null
  // A free name the read site rebinds would be captured by the substitution:
  // it is read as what it holds where the const is declared instead.
  return resolveInitializer(init, ctx, n => ctx.isShadowed(n), constant.isModule ? 'module' : 'component')
}

/**
 * A `const` holding a value computed by an expression, as opposed to a
 * function, JSX, a static object or array the adapters resolve through their
 * own lookups, or a runtime construct. A `let` no statement reassigns after
 * its declaration holds one value too: its render-time reassignments were
 * folded into the initializer (`fold-render-reassignments.ts`, #3501).
 */
function isPlainComputedConst(constant: ConstantInfo, init: ParsedExpr): boolean {
  if (constant.mutatedAfterDeclaration) return false
  if (constant.isJsx || constant.isJsxFunction || constant.containsArrow || constant.isFunctionValue) return false
  if (constant.systemConstructKind) return false
  if (init.kind === 'call' && init.callee.kind === 'identifier' && init.callee.name === 'useContext') return false
  return init.kind !== 'object-literal' && init.kind !== 'array-literal' && init.kind !== 'unsupported'
}

/**
 * Whether every zero-arg identifier call in `init` is a signal or memo read.
 * Any other one (`const label = makeLabel()`) is an opaque accessor: inlined,
 * it would read as a getter of the helper's name, so the const keeps its own
 * refusal path instead.
 */
function callsOnlyGetters(init: ParsedExpr, getters: ReadonlySet<string>): boolean {
  let ok = true
  const visit = (node: unknown): void => {
    if (!ok || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const e = node as ParsedExpr
    if (e.kind === 'call' && e.callee.kind === 'identifier' && e.args.length === 0 && !getters.has(e.callee.name)) {
      ok = false
      return
    }
    for (const value of Object.values(e)) visit(value)
  }
  visit(init)
  return ok
}

/**
 * The initializer of a `const` holding an object literal (`const flags = { a:
 * n > 1, label: 'L' + n }`, `const labels = { ok: 'Fine', err: 'Broken' }`)
 * that a read of `name` stands for, resolved in the scope the const is
 * declared in, or `null` when the read stays as it is. The same visibility
 * rules as {@link inlinableInitializer}, with the const a read reaches decided
 * by `resolveStaticConstBinding`; the literal must list plain
 * `key: value` entries only (no spread), so each key's value is known.
 */
function objectConstInitializer(name: string, ctx: ComputedConstContext): ObjectLiteral | null {
  if (ctx.componentNames.has(name) && !componentConst(name, ctx)) return null
  const constant = resolveStaticConstBinding(name, ctx.constants, n => ctx.isShadowed(n))
  const init = constant?.parsed
  if (!constant || init?.kind !== 'object-literal' || constant.systemConstructKind) return null
  if (literalValues(init) === null) return null
  if (ctx.isShadowed(name) || ctx.getters.has(name) || ctx.contextConsumers.has(name) || ctx.propsBindings.has(name)) return null
  if (ctx.isAdapterBound(name)) return null
  if (!callsOnlyGetters(init, constant.isModule ? new Set() : ctx.getters)) return null
  const resolved = resolveInitializer(init, ctx, n => ctx.isShadowed(n), constant.isModule ? 'module' : 'component')
  return resolved?.kind === 'object-literal' ? resolved : null
}

/**
 * `expr` with each read of a property of the object const `name` replaced by
 * what JS reads there (#3844): `flags.label` by the value the literal gives
 * `label` (`undefined` for a key it does not list), and `labels[kind]` by
 * the conditional that picks the value of the key `kind` equals
 * ({@link keyedValue}). A const that holds an object has no binding in a
 * template, the same as a computed const.
 *
 * An index whose keys are not all known at compile time is read off the
 * literal itself, which the adapter refuses (BF101). `null` (the read stays
 * as written) when `expr` reads `name` whole or reads a key
 * `Object.prototype` holds.
 */
function projectObjectReads(
  expr: ParsedExpr,
  name: string,
  object: ObjectLiteral,
  ctx: ComputedConstContext,
): ParsedExpr | null {
  const objectFree = freeIdentifiers(object) ?? new Set<string>()
  let ok = true
  // What a read chain rooted at `name` (`flags`, `conf.inner`, `labels[k]`)
  // holds, or null for a chain rooted elsewhere.
  const resolve = (e: ParsedExpr, enclosing: ReadonlySet<string>): ParsedExpr | null => {
    if (e.kind === 'identifier') return e.name === name && !enclosing.has(name) ? object : null
    if (e.kind !== 'member' && e.kind !== 'index-access') return null
    const base = resolve(e.object, enclosing)
    if (base === null) return null
    // A read off a value that is not an object (`flags.label.length`) is
    // left to the walk, which projects the inner read.
    if (base.kind !== 'object-literal') return null
    const values = literalValues(base)
    const value = values === null ? undefined : e.kind === 'member' ? memberValue(values, e.property) : keyedValue(values, e.index, enclosing, ctx)
    if (value === undefined) ok = false
    // An index whose keys are not known reads the literal itself, which no
    // template lowers: the adapter refuses it (BF101) instead of reading an
    // unbound name.
    if (value === UNPROVABLE_INDEX && e.kind === 'index-access') return { kind: 'index-access', object: base, index: e.index }
    return value ?? null
  }
  const result = mapParsedExpr(expr, (e, enclosing) => {
    const value = resolve(e, enclosing)
    if (value === null) return null
    // A value read where a callback param rebinds one of its names, or an
    // object read whole, has no projection.
    if (value.kind === 'object-literal' || [...enclosing].some(p => objectFree.has(p))) ok = false
    return value
  })
  return ok ? foldUndefinedTests(result) : null
}

/**
 * `expr` with each conditional whose test compares two operands known at
 * compile time against `undefined` (`'x' === undefined`, `undefined ===
 * undefined`) replaced by the branch it takes. A projected read of a key
 * the literal does or does not list leaves exactly this behind in a
 * destructure default (`conf.tone === undefined ? 'x' : conf.tone`), and a
 * backend need not spell `undefined` the same in every position.
 */
function foldUndefinedTests(expr: ParsedExpr): ParsedExpr {
  return mapParsedExpr(expr, e => {
    if (e.kind !== 'conditional' || e.test.kind !== 'binary' || (e.test.op !== '===' && e.test.op !== '!==')) return null
    const equal = undefinedEquality(e.test.left, e.test.right)
    if (equal === null) return null
    return foldUndefinedTests((equal === (e.test.op === '===')) ? e.consequent : e.alternate)
  })
}

/** Whether `a === b` holds, when one side is `undefined` and the other a literal or `undefined`; null otherwise. */
function undefinedEquality(a: ParsedExpr, b: ParsedExpr): boolean | null {
  const isUndefined = (e: ParsedExpr) => e.kind === 'identifier' && e.name === 'undefined'
  const known = (e: ParsedExpr) => isUndefined(e) || e.kind === 'literal'
  if (!known(a) || !known(b) || (!isUndefined(a) && !isUndefined(b))) return null
  return isUndefined(a) && isUndefined(b)
}

type ObjectLiteral = Extract<ParsedExpr, { kind: 'object-literal' }>

/** The value of each key `object` lists (the last one for a repeated key), or null when it spreads another object. */
function literalValues(object: ObjectLiteral): Map<string, ParsedExpr> | null {
  const values = new Map<string, ParsedExpr>()
  for (const p of object.properties) {
    if (p.kind === 'spread') return null
    values.set(p.key, p.value)
  }
  return values
}

/**
 * What `object.<key>` reads: the value the literal gives `key`, and
 * `undefined` for a key it does not list. `undefined` (no projection) for a
 * key `Object.prototype` holds, which JS reads from there.
 */
function memberValue(values: ReadonlyMap<string, ParsedExpr>, key: string): ParsedExpr | undefined {
  const value = values.get(key)
  if (value) return value
  return key in Object.prototype ? undefined : { kind: 'identifier', name: 'undefined' }
}

/** {@link keyedValue}'s answer for an index whose keys are not all known. */
const UNPROVABLE_INDEX: ParsedExpr = { kind: 'unsupported', raw: '', reason: 'index keys not known at compile time' }

/**
 * `values[index]` as a conditional over the keys the index can hold, with
 * `undefined` for one the literal does not list ({@link projectObjectReads}).
 * Sound only when every key the index can hold is known: its type is a
 * union of string literals (plus `null` / `undefined`) — a prop typed
 * `'ok' | 'err'` — so strict equality with each key is the property lookup
 * JS does. {@link UNPROVABLE_INDEX} otherwise, and also when the index calls
 * something other than a signal or memo getter (the conditional repeats
 * it), when a key it can hold is inherited from `Object.prototype`
 * (`labels['toString']` reads a function), or when it can be `null` /
 * `undefined` and the literal lists `'null'` / `'undefined'`.
 */
function keyedValue(
  values: ReadonlyMap<string, ParsedExpr>,
  index: ParsedExpr,
  enclosing: ReadonlySet<string>,
  ctx: ComputedConstContext,
): ParsedExpr {
  if (!readsOnly(index, ctx.getters)) return UNPROVABLE_INDEX
  // A computed const in the index (`const variant = props.variant ?? 'x'`)
  // is typed as what it holds.
  const domain = indexKeyDomain(inlineComputedConsts(index, ctx), enclosing, ctx)
  if (domain === null) return UNPROVABLE_INDEX
  if (domain.keys.some(k => !values.has(k) && k in Object.prototype)) return UNPROVABLE_INDEX
  if (domain.nullish.some(k => values.has(k))) return UNPROVABLE_INDEX
  let result: ParsedExpr = { kind: 'identifier', name: 'undefined' }
  for (const key of [...domain.keys].reverse()) {
    const value = values.get(key)
    if (!value) continue
    result = {
      kind: 'conditional',
      test: { kind: 'binary', op: '===', left: index, right: { kind: 'literal', value: key, literalType: 'string' } },
      consequent: value,
      alternate: result,
    }
  }
  return result
}

/** The keys an index can hold ({@link keyedValue}): string keys, and whether it can be `null` / `undefined`. */
interface KeyDomain {
  keys: string[]
  nullish: Array<'null' | 'undefined'>
}

/**
 * The keys an index read can hold, from its declared type: a prop read
 * (`kind`, `props.kind`) whose declared type admits only string literals,
 * `null` and `undefined` (`ParamInfo.literalKeys`; an optional prop adds
 * `undefined`), or `a ?? 'x'` over such a read. `null` for any other index, including a name a loop row or callback
 * binds.
 */
function indexKeyDomain(index: ParsedExpr, enclosing: ReadonlySet<string>, ctx: ComputedConstContext): KeyDomain | null {
  if (index.kind === 'logical' && index.op === '??') {
    const left = indexKeyDomain(index.left, enclosing, ctx)
    const right = index.right.kind === 'literal' && typeof index.right.value === 'string' ? index.right.value : null
    if (!left || right === null) return left === null || right === null ? null : left
    return left.nullish.length === 0 ? left : { keys: [...new Set([...left.keys, right])], nullish: [] }
  }
  const param = indexPropParam(index, enclosing, ctx)
  if (!param) return null
  if (!param.literalKeys) return null
  const domain: KeyDomain = { keys: [...param.literalKeys.keys], nullish: [...param.literalKeys.nullish] }
  const readsDefault = index.kind === 'identifier' && param.defaultValue !== undefined
  if (param.optional && !readsDefault && !domain.nullish.includes('undefined')) domain.nullish.push('undefined')
  return domain
}

/** The prop param an index read reads whole (`kind`, `props.kind`), or undefined. */
function indexPropParam(index: ParsedExpr, enclosing: ReadonlySet<string>, ctx: ComputedConstContext): ParamInfo | undefined {
  const visible = (n: string) => !enclosing.has(n) && !ctx.isShadowed(n)
  const params = ctx.props.params.filter(p => !p.isRest)
  if (index.kind === 'identifier') {
    if (!visible(index.name)) return undefined
    if (ctx.props.objectName !== null && !ctx.propsBindings.has(index.name)) return undefined
    return params.find(p => p.name === index.name)
  }
  if (index.kind !== 'member' || index.object.kind !== 'identifier' || index.object.name !== ctx.props.objectName) return undefined
  if (!visible(index.object.name)) return undefined
  return params.find(p => p.sourceName === undefined && p.name === index.property)
}

/** Whether evaluating `expr` twice reads the same value: it calls nothing but signal and memo getters, and holds no function. */
function readsOnly(expr: ParsedExpr, getters: ReadonlySet<string>): boolean {
  let ok = true
  const visit = (node: unknown): void => {
    if (!ok || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const e = node as ParsedExpr
    if (e.kind === 'arrow' || e.kind === 'unsupported') ok = false
    else if (e.kind === 'call' && !(e.callee.kind === 'identifier' && e.args.length === 0 && getters.has(e.callee.name))) ok = false
    else for (const value of Object.values(e)) visit(value)
  }
  visit(expr)
  return ok
}
