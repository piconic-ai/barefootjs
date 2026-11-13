/**
 * Zero-argument calls a template resolves to what the called function
 * returns (#3721).
 *
 * A template has no binding for a component's or module's functions: the
 * backend receives the props, not the JS scope. Every template adapter reads
 * a zero-argument identifier call as a signal or memo getter (`count()` →
 * `count`), so a call to a function (`function value() { return 1 }` called
 * as `value()`) read a template variable of the function's name — nothing,
 * or a prop of the same name, which a `(props)`-arg component flattens into
 * the same template namespace.
 *
 * This is the one decision of what such a call reads, made in two steps.
 * First the declaration the name denotes where the call is written
 * ({@link localBindings}): a component-scope declaration of a name hides
 * the module one, whatever either is, and a function body's names resolve
 * in the scope the function is declared in. A prop counts as a component
 * binding only where its bare name is in scope (`templatePropReadParams`):
 * a destructured parameter, or a body binding that holds the prop. A typed
 * prop the body never binds does not hide a function of its name, as in JS.
 * Then what a call of that declaration is ({@link localCall}): inlined, for
 * a function taking no parameters whose body is a single `return <expr>` (a
 * `function` declaration's `FunctionInfo.returnParsed`, or a zero-param
 * arrow `const`); refused, for any other function; neither, for a binding
 * that is not a function. The consumers resolve the call through this
 * table: the SSR seed plan (signal seeds, memo bodies), the static SSR
 * defaults, the template adapters' shared inlining of markup expressions
 * (`inlineComputedConsts`), and the walk of what a server-rendered position
 * reads (`walkServerReads`).
 */

import { freeIdentifiers, mapParsedExpr, zeroArgCallBody, type ParsedExpr } from './expression-parser.ts'
import { templatePropReadParams, type TemplatePropReadBindings } from './props-binding.ts'
import type { ConstantInfo, FunctionInfo, MemoInfo, SignalInfo } from './types.ts'

/** A scope a name is declared in, and a function body's names are read in. */
export type LocalScope = 'component' | 'module'

/** What a zero-argument call of a function returns, and where its body's names resolve. */
export interface LocalCallBody {
  /** The returned expression. */
  body: ParsedExpr
  /** The scope the function is declared in, which the body's free names are read in. */
  scope: LocalScope
}

/** The component bindings {@link localBindings} reads. */
export interface LocalCallBindings extends TemplatePropReadBindings {
  localFunctions: readonly FunctionInfo[]
  restPropsName?: string | null
  signals: readonly SignalInfo[]
  memos: readonly MemoInfo[]
}

/**
 * What a name denotes in the scope it is declared in. `opaque` is a binding
 * with no declaration to read: a prop in scope by its bare name, the props
 * object, the rest props, a signal setter.
 */
export type LocalBinding =
  | { kind: 'signal'; scope: LocalScope; info: SignalInfo }
  | { kind: 'memo'; scope: LocalScope; info: MemoInfo }
  | { kind: 'const'; scope: LocalScope; info: ConstantInfo }
  | { kind: 'function'; scope: LocalScope; info: FunctionInfo }
  | { kind: 'opaque'; scope: LocalScope }

/** The declaration `name` denotes, read from `from`: `null` for a name neither scope declares. */
export type LocalBindingResolver = (name: string, from: LocalScope) => LocalBinding | null

/**
 * The lexical resolution of a component's and its module's names. Read from
 * the component scope, a component declaration of the name is the binding,
 * and only a name the component does not declare reaches the module's; read
 * from the module scope (a module function's body), only the module's is.
 */
export function localBindings(b: LocalCallBindings): LocalBindingResolver {
  const scopes = { component: new Map<string, LocalBinding>(), module: new Map<string, LocalBinding>() }
  const declare = (name: string, binding: LocalBinding): void => void scopes[binding.scope].set(name, binding)
  for (const info of b.localFunctions) {
    declare(info.name, { kind: 'function', scope: info.inComponentBody ? 'component' : 'module', info })
  }
  for (const info of b.localConstants) declare(info.name, { kind: 'const', scope: info.isModule ? 'module' : 'component', info })
  for (const info of b.memos) declare(info.name, { kind: 'memo', scope: info.isModule ? 'module' : 'component', info })
  for (const info of b.signals) {
    const scope = info.isModule ? 'module' : 'component'
    declare(info.getter, { kind: 'signal', scope, info })
    if (info.setter) declare(info.setter, { kind: 'opaque', scope })
  }
  const props = [b.propsObjectName, b.restPropsName, ...templatePropReadParams(b).map(p => p.name)]
  for (const name of props) if (name) declare(name, { kind: 'opaque', scope: 'component' })
  return (name, from) => (from === 'component' ? scopes.component.get(name) : undefined) ?? scopes.module.get(name) ?? null
}

/**
 * What a zero-argument call of `binding` is to a template: `inline` with the
 * expression the function returns, `refuse` for a function a template
 * cannot inline (one with parameters, a body other than a single `return`,
 * an `async` / generator one, a reassigned arrow `const`), or `null` for a
 * binding that is not such a function. A function returning JSX is inlined
 * into the markup before any template reads it, and is `null` too.
 */
export function localCall(binding: LocalBinding | null): { kind: 'inline'; body: ParsedExpr } | { kind: 'refuse' } | null {
  if (binding?.kind === 'function') {
    const f = binding.info
    if (f.isJsxFunction || f.containsJsx || f.isMultiReturnJsxHelper) return null
    return f.returnParsed ? { kind: 'inline', body: f.returnParsed } : { kind: 'refuse' }
  }
  if (binding?.kind !== 'const') return null
  const c = binding.info
  const body = arrowConstBody(c)
  if (body) return { kind: 'inline', body }
  if (c.declarationKind !== 'const' || c.parsed?.kind !== 'arrow' || c.isJsxFunction || c.isJsx) return null
  return { kind: 'refuse' }
}

/**
 * Each function name a zero-argument call written in `from` reads as a
 * function whose returned expression a template can inline, with that
 * expression ({@link inlinedBody}).
 */
export function localCallBodies(b: LocalCallBindings, from: LocalScope = 'component'): ReadonlyMap<string, LocalCallBody> {
  const resolve = localBindings(b)
  const out = new Map<string, LocalCallBody>()
  for (const name of callableNames(b)) {
    const binding = resolve(name, from)
    const body = binding && inlinedBody(binding, resolve, new Set())
    if (binding && body) out.set(name, { body, scope: binding.scope })
  }
  return out
}

/**
 * Each function name a zero-argument call written in `from` reads as a
 * function a template cannot inline: {@link localCall}'s `refuse`, or a
 * module function whose returned expression calls one. Read as a getter,
 * such a call would render an unbound name or a prop of that name, so a
 * template refuses it.
 */
export function uninlinableLocalCalls(b: LocalCallBindings, from: LocalScope = 'component'): ReadonlySet<string> {
  const resolve = localBindings(b)
  const out = new Set<string>()
  for (const name of callableNames(b)) {
    const binding = resolve(name, from)
    if (binding && localCall(binding) && !inlinedBody(binding, resolve, new Set())) out.add(name)
  }
  return out
}

/**
 * The expression a zero-argument call of `binding` is inlined as, or `null`
 * when a template cannot inline it.
 *
 * A component function's returned expression is read where the call is
 * written (these tables serve the component scope), so it stands as it is.
 * A module function's is not: each local function it calls is the module's,
 * which a component declaration of the same name would replace once the
 * expression sits in the component scope. Those calls are inlined here, in
 * module scope, and one a template cannot inline (or a function calling
 * itself) makes the caller uninlinable too.
 */
function inlinedBody(binding: LocalBinding, resolve: LocalBindingResolver, running: ReadonlySet<LocalBinding>): ParsedExpr | null {
  const call = localCall(binding)
  if (call?.kind !== 'inline' || running.has(binding)) return null
  if (binding.scope === 'component') return call.body
  const inner = new Set(running).add(binding)
  let inlinable = true
  const body = mapParsedExpr(call.body, (e, enclosing) => {
    if (e.kind !== 'call' || e.args.length > 0 || e.callee.kind !== 'identifier' || enclosing.has(e.callee.name)) return null
    const callee = resolve(e.callee.name, 'module')
    if (!callee || !localCall(callee)) return null
    const inlined = inlinedBody(callee, resolve, inner)
    // Inlined under a callback param of one of its names, the expression would read the param.
    const free = inlined && freeIdentifiers(inlined)
    if (!inlined || !free || [...free].some(name => enclosing.has(name))) inlinable = false
    return inlined
  })
  return inlinable ? body : null
}

/** Every name a function declaration or a const binds, in either scope. */
function callableNames(b: LocalCallBindings): Set<string> {
  return new Set([...b.localFunctions.map(f => f.name), ...b.localConstants.map(c => c.name)])
}

/** The body of a zero-param arrow `const` that is never reassigned, or `null`. */
function arrowConstBody(c: ConstantInfo): ParsedExpr | null {
  if (c.declarationKind !== 'const' || c.mutatedAfterDeclaration || !c.parsed) return null
  return zeroArgCallBody(c.parsed)
}
