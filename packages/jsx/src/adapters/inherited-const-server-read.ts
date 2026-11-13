/**
 * BF101 for an inherited literal-const read (`R.toString`, see
 * `spellStaticConstMember`) in a value the server render computes (#3813).
 *
 * An emitter refuses the read where it spells it, but not every read the
 * server render performs is spelled by an emitter whose refusal survives. A
 * signal's seed, a memo's body, a const's initializer and the expression a
 * called function returns are computed apart from the position that reads
 * them: by the SSR seed plan (whose lowering failures fall back silently, on
 * purpose, to the static SSR defaults), by the static evaluator, or on the
 * backend. A position's own value can be dropped the same way (a child prop
 * the Go constructor cannot compute is left out). The value then renders as
 * if the key were missing.
 *
 * This pass refuses the read in each server-rendered position
 * (`walkTemplatePositions`, read in the position's own scope) and in each
 * declaration the server render reads (`walkServerReads`, the one walk of
 * that relation). Both skip `/* @client *\/` positions and resolve each name
 * lexically, so a loop row or a callback param named like a declaration is
 * not that declaration. Within an expression only the reads its evaluation
 * performs are refused: a function is entered where it is called or handed
 * to a call (a callback, an IIFE, a local function or a method of a literal
 * const called by name), not where it is stored
 * (`{ get: () => R.toString }` read for another key, an event handler). A
 * const that only names another (`const A = R`) is read as that one.
 *
 * A block-bodied memo no single expression stands for has no server value
 * computed from its statements (it renders its static default whatever it
 * reads), so it is not read here.
 */

import { parsedExprChildren } from '../action-accessor.ts'
import { resolveStaticConstBinding } from '../augment-inherited-props.ts'
import { isEventHandlerName } from '../event-handler-name.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import { localBindings, localCall, type LocalBindingResolver, type LocalScope } from '../local-call-body.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads } from '../server-read-walk.ts'
import { spellStaticConstMember, staticConstValue, staticIndexKey, type InheritedReadPlace, type StaticConstMemberSink } from '../static-const-member.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR } from '../types.ts'

type Constants = ComponentIR['metadata']['localConstants']

/** Record BF101 for each inherited literal-const read the server render of `ir` performs. */
export function refuseInheritedConstServerReads(ir: ComponentIR, sink: StaticConstMemberSink): void {
  const constants = ir.metadata.localConstants ?? []
  if (constants.length === 0) return
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const shared: Omit<Check, 'place'> = {
    // A module declaration's names are the module's: a component binding of a name does not hide them there.
    constants: { component: constants, module: constants.filter(c => c.isModule).map(c => ({ ...c, shadowedInComponent: false })) },
    scopes: { component, module: BindingScope.EMPTY },
    resolve: localBindings({ ...ir.metadata, localConstants: constants }),
    sink,
    entered: new Set(),
  }
  // This pass runs before any emitter, so its record of a read is the one that stands.
  walkTemplatePositions(ir.root, ({ expr, scope, attrName, loc, role }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    // A component renders on the server whatever directive its prop carries.
    const place = { loc, deferrable: role !== 'prop' }
    refuseReads(expr, { scope: scope ?? component, from: 'component' }, { ...shared, place }, 'value')
  }, component)
  walkServerReads(ir, (read) => {
    if (!read.expr) return
    refuseReads(read.expr, { scope: shared.scopes[read.scope], from: read.scope }, { ...shared, place: { loc: read.loc } }, 'value')
  })
}

interface Check {
  constants: Record<LocalScope, Constants>
  /** The scope a declaration of each `LocalScope` is read in. */
  scopes: Record<LocalScope, BindingScope>
  resolve: LocalBindingResolver
  sink: StaticConstMemberSink
  place: InheritedReadPlace
  /** The function bodies already entered, so one that calls itself ends. */
  entered: Set<ParsedExpr>
}

/** Where an expression is read: the bindings around it, and the scope its free names are declared in. */
interface At {
  scope: BindingScope
  from: LocalScope
}

/** How the expression being visited is used: its value, the function a call calls, or an argument handed to a call. */
type Use = 'value' | 'callee' | 'argument'

function refuseReads(expr: ParsedExpr, at: At, check: Check, use: Use): void {
  if (expr.kind === 'arrow') {
    // A stored function evaluates nothing until it is called.
    if (use !== 'value') refuseReads(expr.body, { ...at, scope: at.scope.enterCallback(expr.params) }, check, 'value')
    return
  }
  if (use === 'callee') enterCalledFunction(expr, at, check)
  else if (expr.kind === 'member' || expr.kind === 'index-access') {
    const key = expr.kind === 'member' ? expr.property : staticIndexKey(expr.index)
    const isShadowed = (name: string): boolean => at.scope.isBound(name)
    const object = throughAliases(expr.object, check.constants[at.from], isShadowed)
    if (key !== null) spellStaticConstMember(object, key, check.constants[at.from], isShadowed, check.sink, check.place)
  }
  for (const child of parsedExprChildren(expr)) refuseReads(child.expr, at, check, childUse(expr, child.expr))
}

function childUse(parent: ParsedExpr, child: ParsedExpr): Use {
  if (parent.kind === 'call') return child === parent.callee ? 'callee' : 'argument'
  if (parent.kind === 'array-method') return child === parent.object ? 'value' : 'argument'
  return 'value'
}

/**
 * A call by name evaluates the called function's body, in the scope the
 * function is declared in: an arrow `const` (`f('a')`), a function
 * declaration a template inlines (`localCall`), or a literal const's own
 * method (`H.get()`).
 */
function enterCalledFunction(callee: ParsedExpr, at: At, check: Check): void {
  const isShadowed = (name: string): boolean => at.scope.isBound(name)
  if (callee.kind !== 'identifier') {
    const method = staticConstValue(throughAliases(callee, check.constants[at.from], isShadowed), check.constants[at.from], isShadowed)
    if (method?.kind === 'arrow') enterBody(method.body, method.params, at.from, check)
    return
  }
  const binding = isShadowed(callee.name) ? null : check.resolve(callee.name, at.from)
  if (binding?.kind === 'const' && binding.info.declarationKind === 'const' && binding.info.parsed?.kind === 'arrow') {
    enterBody(binding.info.parsed.body, binding.info.parsed.params, binding.scope, check)
  } else if (binding?.kind === 'function') {
    const call = localCall(binding)
    if (call?.kind === 'inline') enterBody(call.body, [], binding.scope, check)
  }
}

function enterBody(body: ParsedExpr, params: readonly string[], from: LocalScope, check: Check): void {
  if (check.entered.has(body)) return
  check.entered.add(body)
  refuseReads(body, { scope: check.scopes[from].enterCallback(params), from }, check, 'value')
}

/** `expr` with a root const that only names another const (`const A = R`) replaced by that one. */
function throughAliases(expr: ParsedExpr, constants: Constants, isShadowed: (name: string) => boolean, hops = 0): ParsedExpr {
  if (expr.kind === 'member' || expr.kind === 'index-access') {
    return { ...expr, object: throughAliases(expr.object, constants, isShadowed, hops) }
  }
  if (expr.kind !== 'identifier' || hops > constants.length) return expr
  const named = resolveStaticConstBinding(expr.name, constants, isShadowed)?.parsed
  // The aliased name is read where the alias is declared, outside any callback around the read.
  return named?.kind === 'identifier' ? throughAliases(named, constants, () => false, hops + 1) : expr
}
