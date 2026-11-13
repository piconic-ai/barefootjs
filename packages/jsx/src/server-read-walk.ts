/**
 * The declarations a component's server render reads (#3721).
 *
 * A template renders a position from the values it reads there, and each of
 * those from the values its own expression reads: a signal's seed, a memo's
 * body, a const's initializer, the expression a called function returns.
 * This is the one walk of that relation. It starts at every template
 * position (`walkTemplatePositions`, which skips `/* @client *\/` reads) and
 * follows the names each expression reads free, each resolved lexically
 * (`localBindings`): a position's names in the scope it is read in, so a
 * loop row, a callback param or a preamble local of a name is not the
 * component's declaration of it (`BindingScope`); a declaration's names in
 * the scope it is declared in, so a module function's body never reads a
 * component binding.
 *
 * A function is read only where it is called with no arguments and a
 * template inlines the call (`localCall`): its returned expression is then
 * followed like any other. A call a template cannot inline ends the walk
 * there and is reported on the declaration that makes it
 * (`ServerRead.refusedCalls`). A function passed on uncalled, an event
 * handler prop and a module-scope signal or memo (which never renders on the
 * server) read nothing here.
 */

import { freeIdentifiers, mapParsedExpr, type ParsedExpr, type ParsedStatement } from './expression-parser.ts'
import { isEventHandlerName } from './event-handler-name.ts'
import { localBindings, localCall, type LocalBinding, type LocalBindingResolver, type LocalScope } from './local-call-body.ts'
import { BindingScope } from './scope/binding-scope.ts'
import { walkTemplatePositions } from './template-position-walk.ts'
import type { ComponentIR, SourceLocation } from './types.ts'

/** A declaration the server render reads. */
export interface ServerRead {
  name: string
  kind: 'signal' | 'memo' | 'const' | 'function'
  /** The scope the declaration sits in. */
  scope: LocalScope
  loc: SourceLocation
  /**
   * The expression its value comes from (a called function's returned
   * expression), read in `scope`. Unset for a declaration with no
   * expression tree (a block-bodied memo no single expression stands for).
   */
  expr: ParsedExpr | undefined
  /**
   * The statements of a block-bodied memo with no `expr`, as far as its
   * parse represents them. No server value is computed from them, but they
   * are what the browser evaluates for the same slot.
   */
  block: readonly ParsedStatement[] | undefined
  /**
   * The functions its expression calls with no arguments that a template
   * cannot inline, by the name they are called under. Empty for a
   * declaration with no expression tree (a block-bodied memo).
   */
  refusedCalls: readonly string[]
}

/** What one expression reads: its free names, and those it calls with no arguments. */
interface Reads {
  names: Iterable<string>
  called: ReadonlySet<string>
}

/** A declaration the walk follows, with the expression its value comes from. */
interface Followed {
  kind: ServerRead['kind']
  loc: SourceLocation
  expr: ParsedExpr | undefined
  block?: readonly ParsedStatement[]
  /** The names the declaration reads when its expression has no tree. */
  fallback: ReadonlySet<string> | undefined
}

/** Visit each declaration the server render of `ir` reads, once. */
export function walkServerReads(ir: ComponentIR, visit: (read: ServerRead) => void): void {
  const resolve = localBindings({ ...ir.metadata, localConstants: ir.metadata.localConstants ?? [] })
  const seen = new Set<LocalBinding>()
  const pending: Array<{ reads: Reads; from: LocalScope }> = []

  const follow = (name: string, binding: LocalBinding): void => {
    const followed = followedDeclaration(binding)
    if (!followed || seen.has(binding)) return
    seen.add(binding)
    const reads = readsOf(followed.expr, followed.fallback)
    const refusedCalls = [...reads.called].filter(fn => localCall(resolve(fn, binding.scope))?.kind === 'refuse')
    visit({ name, kind: followed.kind, scope: binding.scope, loc: followed.loc, expr: followed.expr, block: followed.block, refusedCalls })
    pending.push({ reads, from: binding.scope })
  }
  const followReads = (reads: Reads, from: LocalScope, isBound: (name: string) => boolean): void => {
    for (const name of reads.names) {
      if (isBound(name)) continue
      const binding = resolve(name, from)
      if (binding && isRead(binding, reads.called.has(name))) follow(name, binding)
    }
  }

  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  walkTemplatePositions(ir.root, ({ expr, scope, attrName }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    followReads(readsOf(expr, undefined), 'component', name => (scope ?? component).isBound(name))
  }, component)
  for (let next = pending.pop(); next; next = pending.pop()) followReads(next.reads, next.from, () => false)
}

/** Whether reading `binding` reads its declaration: a function only where it is called. */
function isRead(binding: LocalBinding, called: boolean): boolean {
  if (binding.kind === 'function' || (binding.kind === 'const' && binding.info.parsed?.kind === 'arrow')) {
    return called && localCall(binding)?.kind === 'inline'
  }
  return true
}

/** {@link Followed} for `binding`, or `null` for one with nothing the server render computes. */
function followedDeclaration(binding: LocalBinding): Followed | null {
  switch (binding.kind) {
    case 'opaque':
      return null
    case 'signal': {
      const s = binding.info
      if (s.isModule || s.envReader) return null
      return { kind: 'signal', loc: s.loc, expr: s.parsed, fallback: s.initialFreeIdentifiers }
    }
    case 'memo': {
      const m = binding.info
      if (m.isModule) return null
      const block = m.parsed ? undefined : m.parsedBlock
      return { kind: 'memo', loc: m.loc, expr: m.parsed, block, fallback: m.computationFreeIdentifiers }
    }
    case 'const': {
      const c = binding.info
      // JSX is inlined into the markup, where the positions already read it.
      if (c.isJsx || c.isJsxFunction) return null
      const call = localCall(binding)
      const expr = call?.kind === 'inline' ? call.body : c.parsed
      return { kind: call ? 'function' : 'const', loc: c.loc, expr, fallback: c.freeIdentifiers }
    }
    case 'function': {
      const call = localCall(binding)
      if (call?.kind !== 'inline') return null
      return { kind: 'function', loc: binding.info.loc, expr: call.body, fallback: undefined }
    }
  }
}

/** {@link Reads} of `expr`, or of `fallback` (calling nothing) when it has no analyzable tree. */
function readsOf(expr: ParsedExpr | undefined, fallback: ReadonlySet<string> | undefined): Reads {
  const names = expr && freeIdentifiers(expr)
  // An IR that went through JSON holds no `Set`: such a declaration reads nothing here.
  if (!expr || !names) return { names: fallback instanceof Set ? fallback : [], called: new Set() }
  const called = new Set<string>()
  mapParsedExpr(expr, (e, enclosing) => {
    if (e.kind === 'call' && e.args.length === 0 && e.callee.kind === 'identifier' && !enclosing.has(e.callee.name)) {
      called.add(e.callee.name)
    }
    return null
  })
  return { names, called }
}
