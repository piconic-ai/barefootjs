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
 * This is the one decision of which such calls a template inlines: a
 * function taking no parameters whose body is a single `return <expr>` (a
 * `function` declaration's `FunctionInfo.returnParsed`, or a zero-param
 * arrow `const`), read where no other binding of that name hides it. A
 * prop counts as a binding only where its bare name is in scope
 * (`templatePropReadParams`): a destructured parameter, or a body binding
 * that holds the prop. A typed prop the body never binds does not hide a
 * function of its name, as in JS. The consumers resolve the call through
 * this table: the SSR seed plan (signal seeds, memo bodies), the static SSR
 * defaults, and the template adapters' shared inlining of markup
 * expressions (`inlineComputedConsts`).
 */

import { zeroArgCallBody, type ParsedExpr } from './expression-parser.ts'
import { templatePropReadParams, type TemplatePropReadBindings } from './props-binding.ts'
import type { ConstantInfo, FunctionInfo } from './types.ts'

/** What a zero-argument call of a function returns, and where its body's names resolve. */
export interface LocalCallBody {
  /** The returned expression. */
  body: ParsedExpr
  /** The scope the function is declared in, which the body's free names are read in. */
  scope: 'component' | 'module'
}

/** The component bindings {@link localCallBodies} reads. */
export interface LocalCallBindings extends TemplatePropReadBindings {
  localFunctions: readonly FunctionInfo[]
  restPropsName?: string | null
  signals: TemplatePropReadBindings['signals']
}

/**
 * Each function name a zero-argument call reads as a function whose returned
 * expression a template can inline, with that expression. A component-scope
 * declaration of a name hides a module one; a function the component scope
 * binds otherwise (a signal, memo, other local, a prop in scope by its bare
 * name, the props object or the rest props) is not listed.
 */
export function localCallBodies(b: LocalCallBindings): ReadonlyMap<string, LocalCallBody> {
  const component = new Map<string, LocalCallBody>()
  const module = new Map<string, LocalCallBody>()
  for (const f of b.localFunctions) {
    if (!f.returnParsed) continue
    const scope = f.inComponentBody ? 'component' : 'module'
    ;(scope === 'component' ? component : module).set(f.name, { body: f.returnParsed, scope })
  }
  for (const c of b.localConstants) {
    const body = arrowConstBody(c)
    if (!body) continue
    const scope = c.isModule ? 'module' : 'component'
    ;(scope === 'component' ? component : module).set(c.name, { body, scope })
  }
  const hidden = otherComponentBindings(b)
  const out = new Map<string, LocalCallBody>()
  for (const [name, entry] of module) if (!hidden.has(name) && !isComponentConst(name, b)) out.set(name, entry)
  for (const [name, entry] of component) if (!hidden.has(name)) out.set(name, entry)
  return out
}

/**
 * Each function name a zero-argument call reads as a function a template
 * cannot inline: one with parameters, a body other than a single `return`,
 * or an `async` / generator one, a `function` declaration or an arrow
 * `const`. Read as a getter, such a call would render an unbound name or a
 * prop of that name, so a template refuses it. A function returning JSX is
 * inlined into the markup before any template reads it, and is not listed;
 * nor is a name another component binding hides (as for
 * {@link localCallBodies}).
 */
export function uninlinableLocalCalls(b: LocalCallBindings): ReadonlySet<string> {
  const inlinable = localCallBodies(b)
  const hidden = otherComponentBindings(b)
  const out = new Set<string>()
  const componentConsts = new Set(b.localConstants.filter(c => !c.isModule).map(c => c.name))
  const add = (name: string, module: boolean): void => {
    if (inlinable.has(name) || hidden.has(name) || (module && componentConsts.has(name))) return
    out.add(name)
  }
  for (const f of b.localFunctions) {
    if (f.isJsxFunction || f.containsJsx || f.isMultiReturnJsxHelper) continue
    add(f.name, !f.inComponentBody)
  }
  for (const c of b.localConstants) {
    if (c.declarationKind !== 'const' || c.parsed?.kind !== 'arrow' || c.isJsxFunction || c.isJsx) continue
    add(c.name, !!c.isModule)
  }
  return out
}

/** The body of a zero-param arrow `const` that is never reassigned, or `null`. */
function arrowConstBody(c: ConstantInfo): ParsedExpr | null {
  if (c.declarationKind !== 'const' || c.mutatedAfterDeclaration || !c.parsed) return null
  return zeroArgCallBody(c.parsed)
}

/** Whether a component-scope const other than an inlinable arrow is named `name`. */
function isComponentConst(name: string, b: LocalCallBindings): boolean {
  return b.localConstants.some(c => !c.isModule && c.name === name && arrowConstBody(c) === null)
}

/**
 * Component-scope names bound to something a call cannot be inlined through:
 * signals, memos, the props object, the rest props and the props in scope by
 * their bare name.
 */
function otherComponentBindings(b: LocalCallBindings): Set<string> {
  const names = new Set<string>()
  for (const s of b.signals) {
    names.add(s.getter)
    if (s.setter) names.add(s.setter)
  }
  for (const m of b.memos) names.add(m.name)
  if (b.propsObjectName) names.add(b.propsObjectName)
  if (b.restPropsName) names.add(b.restPropsName)
  for (const p of templatePropReadParams(b)) names.add(p.name)
  return names
}
