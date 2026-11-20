/**
 * The parts of an expression its evaluation runs (#3813, #3954).
 *
 * A function stored in a value (`{ get: () => … }`, an arrow handed on as a
 * prop) evaluates nothing until it is called, so its body is not visited
 * there. A function is entered where it is called or handed to a call: an
 * IIFE, a callback, an arrow `const` or an inlinable local function called by
 * name, and a literal const's own method called by name (`api.add()`), each
 * body read in the scope it is declared in.
 *
 * This is the one answer to "which reads does evaluating this expression
 * perform", shared by the server-read walk (which names a declaration reads),
 * the inherited-const refusal and the unlowered-array-element refusal.
 */

import { parsedExprChildren } from './action-accessor.ts'
import { resolveStaticConstBinding } from './augment-inherited-props.ts'
import type { ParsedExpr } from './expression-parser.ts'
import { localCall, type LocalBindingResolver, type LocalScope } from './local-call-body.ts'
import type { BindingScope } from './scope/binding-scope.ts'
import { staticConstValue } from './static-const-member.ts'
import type { ComponentIR } from './types.ts'

export type EvaluatedConstants = ComponentIR['metadata']['localConstants']

/** What an evaluation walk resolves names against. */
export interface EvaluatedWalkContext {
  /** The consts a name read in each `LocalScope` may name. */
  constants: Record<LocalScope, EvaluatedConstants>
  /** The scope a declaration of each `LocalScope` is read in. */
  scopes: Record<LocalScope, BindingScope>
  resolve: LocalBindingResolver
  /** The function bodies already entered, so one that calls itself ends. */
  entered: Set<ParsedExpr>
}

/** Where an expression is read: the bindings around it, and the scope its free names are declared in. */
export interface EvaluatedAt {
  scope: BindingScope
  from: LocalScope
}

/** How the expression being visited is used: its value, the function a call calls, or an argument handed to a call. */
export type EvaluatedUse = 'value' | 'callee' | 'argument'

export type EvaluatedVisitor = (expr: ParsedExpr, at: EvaluatedAt, use: EvaluatedUse) => void

/** Visit each node of `expr` its evaluation runs, entering the functions it calls. */
export function walkEvaluated(expr: ParsedExpr, at: EvaluatedAt, ctx: EvaluatedWalkContext, visit: EvaluatedVisitor, use: EvaluatedUse = 'value'): void {
  if (expr.kind === 'arrow') {
    // A stored function evaluates nothing until it is called.
    if (use !== 'value') walkEvaluated(expr.body, { ...at, scope: at.scope.enterCallback(expr.params) }, ctx, visit, 'value')
    return
  }
  visit(expr, at, use)
  if (use === 'callee') enterCalledFunction(expr, at, ctx, visit)
  for (const child of parsedExprChildren(expr)) walkEvaluated(child.expr, at, ctx, visit, childUse(expr, child.expr))
}

function childUse(parent: ParsedExpr, child: ParsedExpr): EvaluatedUse {
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
function enterCalledFunction(callee: ParsedExpr, at: EvaluatedAt, ctx: EvaluatedWalkContext, visit: EvaluatedVisitor): void {
  const isShadowed = (name: string): boolean => at.scope.isBound(name)
  if (callee.kind !== 'identifier') {
    const method = staticConstValue(throughAliases(callee, ctx.constants[at.from], isShadowed), ctx.constants[at.from], isShadowed)
    if (method?.kind === 'arrow') enterBody(method.body, method.params, at.from, ctx, visit)
    return
  }
  const binding = isShadowed(callee.name) ? null : ctx.resolve(callee.name, at.from)
  if (binding?.kind === 'const' && binding.info.declarationKind === 'const' && binding.info.parsed?.kind === 'arrow') {
    enterBody(binding.info.parsed.body, binding.info.parsed.params, binding.scope, ctx, visit)
  } else if (binding?.kind === 'function') {
    const call = localCall(binding)
    if (call?.kind === 'inline') enterBody(call.body, [], binding.scope, ctx, visit)
  }
}

function enterBody(body: ParsedExpr, params: readonly string[], from: LocalScope, ctx: EvaluatedWalkContext, visit: EvaluatedVisitor): void {
  if (ctx.entered.has(body)) return
  ctx.entered.add(body)
  walkEvaluated(body, { scope: ctx.scopes[from].enterCallback(params), from }, ctx, visit, 'value')
}

/** `expr` with a root const that only names another const (`const A = R`) replaced by that one. */
export function throughAliases(expr: ParsedExpr, constants: EvaluatedConstants, isShadowed: (name: string) => boolean, hops = 0): ParsedExpr {
  if (expr.kind === 'member' || expr.kind === 'index-access') {
    return { ...expr, object: throughAliases(expr.object, constants, isShadowed, hops) }
  }
  if (expr.kind !== 'identifier' || hops > constants.length) return expr
  const named = resolveStaticConstBinding(expr.name, constants, isShadowed)?.parsed
  // The aliased name is read where the alias is declared, outside any callback around the read.
  return named?.kind === 'identifier' ? throughAliases(named, constants, () => false, hops + 1) : expr
}
