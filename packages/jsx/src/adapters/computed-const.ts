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

import { collectContextConsumers, lookupLiteralConst } from '../augment-inherited-props.ts'
import { freeIdentifiers, inlineBinding, parseExpression, stringifyParsedExpr, type ParsedExpr } from '../expression-parser.ts'
import type { ConstantInfo, ExpressionAttr, IRMetadata } from '../types.ts'
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
function componentScopeNames(metadata: IRMetadata): Set<string> {
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
