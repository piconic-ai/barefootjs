/**
 * What a computed destructure default evaluates, once the declarations it
 * reads are resolved (#3725, #3791).
 *
 * A backend applies a computed default when it renders (the SSR seed plan's
 * prop steps, Go's props constructor), and it receives the props, not the JS
 * scope: a default naming a const (`const DEF = 'z'`, `{ b =
 * DEF.toUpperCase() }`) or calling a function has nothing to read there.
 * This is the one resolution of those names into the expression the default
 * stands for, each name read lexically (`localBindings`):
 *
 *   - A body destructure (`const { b = DEF } = props`) reads the component
 *     scope, where a component const hides a module const of its name.
 *   - A parameter destructure (`function C({ b = DEF })`) reads the module
 *     scope: a parameter default cannot see the body's declarations.
 *
 * A `const` is replaced by its own value resolved in the scope it is
 * declared in, and a zero-argument call of a function a template inlines
 * (`localCall`) by the expression it returns. A module value is taken only
 * when nothing is left to read in it, so no name it reads can meet a
 * component binding where it lands. What stays free is a prop, the props
 * object, a global, or a module name no backend computes.
 *
 * A component-scope declaration that has no such value (a signal, a memo, a
 * `let`, a mutated const, a function with parameters or statements, a const
 * declared after the destructure, which JS has not initialized when the
 * default runs) leaves the default with nothing a template can compute: it
 * is `blocked`, and the adapters refuse it where the server render reads the
 * prop (`refuseUnappliedPropDefaults`).
 */

import { freeIdentifiers, mapParsedExpr, type ParsedExpr } from './expression-parser.ts'
import { localBindings, localCall, type LocalBinding, type LocalBindingResolver, type LocalScope } from './local-call-body.ts'
import { templatePropReadParams } from './props-binding.ts'
import type { IRMetadata, ParamInfo, Position, SourceLocation } from './types.ts'

/** A computed destructure default with the declarations it reads resolved. */
export interface ResolvedPropDefault {
  /** The default as the expression it stands for. */
  expr: ParsedExpr
  /** Whether a declaration the default reads was resolved into `expr`. */
  readsDeclaration: boolean
  /** Where a body destructure binds the prop; unset for a parameter default. */
  loc: SourceLocation | undefined
  /** The component declarations it reads that have no value a template can compute. */
  blocked: readonly string[]
}

/** The metadata {@link propDefaultResolver} reads. */
export type PropDefaultBindings = Pick<
  IRMetadata,
  'propsParams' | 'propsObjectName' | 'restPropsName' | 'signals' | 'memos' | 'localFunctions' | 'localConstants'
>

/** One expression resolved in one scope. */
interface Resolution {
  expr: ParsedExpr
  blocked: Set<string>
  /** Whether a declaration was resolved into `expr`. */
  replaced: boolean
}

/** What a free name of an expression is replaced by. */
type Replacement =
  | { kind: 'keep' }
  | { kind: 'blocked' }
  /** Every free read of the name. */
  | { kind: 'value'; value: Resolution }
  /** Only a call of the name with no arguments; any other read of it is `otherwise`. */
  | { kind: 'call'; value: Resolution; otherwise: 'keep' | 'blocked' }

/**
 * The resolver of a component's destructure defaults: `p`'s default as the
 * expression it stands for ({@link ResolvedPropDefault}), or `null` for a
 * prop with no parsed default.
 */
export function propDefaultResolver(metadata: PropDefaultBindings): (p: ParamInfo) => ResolvedPropDefault | null {
  const bindings = { ...metadata, localConstants: metadata.localConstants ?? [] }
  const resolve = localBindings(bindings)
  const props = new Set<string>(templatePropReadParams(bindings).map(p => p.name))
  if (metadata.propsObjectName) props.add(metadata.propsObjectName)
  if (metadata.restPropsName) props.add(metadata.restPropsName)
  const bodyBound = new Map<string, SourceLocation>()
  for (const c of bindings.localConstants) if (!c.isModule && c.propsDestructure) bodyBound.set(c.name, c.loc)
  return (p) => {
    if (p.isRest || !p.parsed) return null
    const loc = bodyBound.get(p.name)
    const resolver = new DeclarationResolver(resolve, props, loc?.start)
    const { expr, blocked, replaced } = resolver.resolveExpr(p.parsed, loc ? 'component' : 'module', true)
    return { expr, blocked: [...blocked], readsDeclaration: replaced, loc }
  }
}

/** Resolves one default through the declarations it reads, each declaration once. */
class DeclarationResolver {
  private readonly values = new Map<LocalBinding['scope'], Map<string, Resolution | null>>([
    ['component', new Map()],
    ['module', new Map()],
  ])

  constructor(
    private readonly resolve: LocalBindingResolver,
    /** The names a template reads as props, which hide a module declaration of the name. */
    private readonly props: ReadonlySet<string>,
    /** Where the body destructure holding the default starts: a component const declared from there on is not initialized yet. */
    private readonly runsAt: Position | undefined,
  ) {}

  /**
   * `expr` with each free name read from `scope` replaced by what it
   * denotes. `propsInScope` is whether the expression sits where the props
   * are bound (a default, a component declaration), not in a module one.
   */
  resolveExpr(expr: ParsedExpr, scope: LocalScope, propsInScope: boolean): Resolution {
    const blocked = new Set<string>()
    const free = freeIdentifiers(expr)
    if (!free) return { expr, blocked, replaced: false }
    const replacements = new Map<string, Replacement>()
    for (const name of free) {
      const replacement = propsInScope && this.props.has(name) ? KEEP : this.replacementOf(name, scope)
      if (replacement.kind !== 'keep') replacements.set(name, replacement)
    }
    if (replacements.size === 0) return { expr, blocked, replaced: false }
    let replaced = false
    // A value landing under a callback param of one of its own names would read the param.
    const take = (name: string, value: Resolution, enclosing: ReadonlySet<string>): ParsedExpr | null => {
      const reads = freeIdentifiers(value.expr)
      if (!reads || [...reads].some(read => enclosing.has(read))) {
        blocked.add(name)
        return null
      }
      for (const b of value.blocked) blocked.add(b)
      replaced = true
      return value.expr
    }
    const resolved = mapParsedExpr(expr, (e, enclosing) => {
      if (e.kind === 'call' && e.args.length === 0 && e.callee.kind === 'identifier' && !enclosing.has(e.callee.name)) {
        const r = replacements.get(e.callee.name)
        if (r?.kind === 'call') return take(e.callee.name, r.value, enclosing)
      }
      if (e.kind !== 'identifier' || enclosing.has(e.name)) return null
      const r = replacements.get(e.name)
      if (r?.kind === 'value') return take(e.name, r.value, enclosing)
      if (r?.kind === 'blocked' || (r?.kind === 'call' && r.otherwise === 'blocked')) blocked.add(e.name)
      return null
    })
    return { expr: replaced ? resolved : expr, blocked, replaced }
  }

  /** What a free read of `name` from `scope` is replaced by. */
  private replacementOf(name: string, scope: LocalScope): Replacement {
    const binding = this.resolve(name, scope)
    if (!binding || binding.kind === 'opaque') return KEEP
    // A module declaration no backend computes stays a name, as before.
    const otherwise = binding.scope === 'component' ? 'blocked' : 'keep'
    if (binding.kind === 'const' && binding.scope === 'component' && !this.isInitialized(binding.info.loc?.start)) return { kind: 'blocked' }
    const call = localCall(binding)
    if (call) {
      const value = call.kind === 'inline' ? this.valueOf(name, binding, call.body) : null
      return value ? { kind: 'call', value, otherwise } : { kind: otherwise }
    }
    const value = binding.kind === 'const' && isStableConst(binding) ? this.valueOf(name, binding, binding.info.parsed!) : null
    return value ? { kind: 'value', value } : { kind: otherwise }
  }

  /** Whether a component const declared at `declared` holds its value when the default runs. */
  private isInitialized(declared: Position | undefined): boolean {
    const at = this.runsAt
    return !at || !declared || declared.line < at.line || (declared.line === at.line && declared.column < at.column)
  }

  /**
   * The value `binding` (declared as `name`) holds, resolved in its own
   * scope: `null` for a module value that still reads something, or one
   * that reads itself.
   */
  private valueOf(name: string, binding: LocalBinding, expr: ParsedExpr): Resolution | null {
    const known = this.values.get(binding.scope)!
    if (known.has(name)) return known.get(name) ?? null
    known.set(name, null)
    const value = this.resolveExpr(expr, binding.scope, binding.scope === 'component')
    const closed = binding.scope === 'component' || freeIdentifiers(value.expr)?.size === 0
    const result = closed ? value : null
    known.set(name, result)
    return result
  }
}

const KEEP: Replacement = { kind: 'keep' }

/** A `const` holding the one value its initializer gives it, which a template can read in its place. */
function isStableConst(binding: Extract<LocalBinding, { kind: 'const' }>): boolean {
  const c = binding.info
  return c.declarationKind === 'const' && !c.mutatedAfterDeclaration && c.parsed !== undefined && !c.isJsx && !c.isJsxFunction
}
