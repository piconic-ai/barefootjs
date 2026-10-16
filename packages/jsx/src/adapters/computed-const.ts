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

export interface ComputedConstContext {
  constants: IRMetadata['localConstants'] | undefined
  /** Signal getters and memo names: the zero-arg calls a template reads as values. */
  getters: ReadonlySet<string>
  /** Context consumers (`const theme = useContext(ThemeContext)`), which the adapter seeds itself. */
  contextConsumers: ReadonlySet<string>
  /** Consts a props destructure binds, which the adapter binds as props params. */
  propsBindings: ReadonlySet<string>
  /** Whether a loop row or callback binds `name` where the expression is read. */
  isShadowed(name: string): boolean
  /** Whether the adapter binds the const `name` itself, so a read of it stays as written. */
  isAdapterBound(name: string): boolean
}

/** The {@link ComputedConstContext} fields that come from the component's metadata. */
export function computedConstContext(
  metadata: IRMetadata,
  isShadowed: (name: string) => boolean,
  isAdapterBound: (name: string) => boolean = () => false,
): ComputedConstContext {
  return {
    constants: metadata.localConstants,
    getters: new Set([...metadata.signals.map(s => s.getter), ...metadata.memos.map(m => m.name)]),
    contextConsumers: new Set(collectContextConsumers(metadata).map(c => c.localName)),
    propsBindings: propsBindingNames(metadata),
    isShadowed,
    isAdapterBound,
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
    result = inlineBinding(result, name, init) ?? result
  }
  return result
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
  const constant = ctx.constants?.find(c => c.name === name)
  const init = constant?.parsed
  if (!constant || !init || !isPlainComputedConst(constant, init)) return null
  if (ctx.isShadowed(name) || ctx.getters.has(name) || ctx.contextConsumers.has(name) || ctx.propsBindings.has(name)) return null
  if (ctx.isAdapterBound(name)) return null
  // An adapter already inlines a literal const in its own syntax.
  if (lookupLiteralConst(name, ctx.constants, ctx.isShadowed) !== null) return null
  // A free name the read site rebinds would be captured by the substitution.
  const free = freeIdentifiers(init)
  if (!free || [...free].some(n => ctx.isShadowed(n))) return null
  return callsOnlyGetters(init, ctx.getters) ? init : null
}

/**
 * A `const` holding a value computed by an expression, as opposed to a
 * function, JSX, a static object or array the adapters resolve through their
 * own lookups, or a runtime construct.
 */
function isPlainComputedConst(constant: ConstantInfo, init: ParsedExpr): boolean {
  if (constant.declarationKind !== 'const' || constant.mutatedAfterDeclaration) return false
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
