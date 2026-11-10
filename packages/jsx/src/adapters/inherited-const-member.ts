/**
 * The refusal of a literal const member read that only the prototype
 * answers (`REC['toString']`, `REC.constructor`, `QS['map']`).
 *
 * JS reads a function there (`Object.prototype.toString`,
 * `Array.prototype.map`), so the read is truthy in a condition and renders
 * the function's source text in text. A template holds the const's literal
 * value, which has no prototype, so every template adapter refuses the read
 * with BF101 instead of rendering the key as missing. The decision of which
 * reads these are is `readStaticConstMember`'s (`static-const-member.ts`);
 * the error is recorded here, once per component, over every template
 * position, each read in its own scope, and over the bodies of the memos,
 * constants and local functions those positions reach (`ssrReads`).
 */

import { exprToString, type ParsedExpr } from '../expression-parser.ts'
import { parsedExprChildren } from '../action-accessor.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { readStaticConstMember, staticIndexKey } from '../static-const-member.ts'
import { declarationExprs, functionLocalNames, ssrReads } from '../ssr-read-declarations.ts'
import type { ComponentIR, SourceLocation } from '../types.ts'
import type { NonPrimitiveEqualitySink } from './non-primitive-equality.ts'

type Constants = ComponentIR['metadata']['localConstants']

/**
 * Each member read in `expr` that only the const literal's prototype
 * answers. A call's callee (`QS.map(…)`, `REC.hasOwnProperty('k')`) is a
 * method call, which the adapters lower as such, not a read of the
 * function; only its receiver is visited.
 */
function inheritedReads(expr: ParsedExpr, scope: BindingScope, constants: Constants): ParsedExpr[] {
  const found: ParsedExpr[] = []
  const visit = (e: ParsedExpr, at: BindingScope, isCallee: boolean): void => {
    const key = e.kind === 'member' ? e.property : e.kind === 'index-access' ? staticIndexKey(e.index) : null
    if (!isCallee && key !== null && (e.kind === 'member' || e.kind === 'index-access')) {
      const read = readStaticConstMember(e.object, key, constants, name => at.isBound(name))
      if (read?.kind === 'inherited') found.push(e)
    }
    for (const child of parsedExprChildren(e)) {
      visit(child.expr, child.params ? at.enterCallback(child.params) : at, e.kind === 'call' && child.expr === e.callee)
    }
  }
  visit(expr, scope, false)
  return found
}

/**
 * Record BF101 for every literal const member read that only the prototype
 * answers, in `ir`'s server-rendered positions and in the bodies of the
 * memos, constants and local functions they reach (`ssrReads`). One error per
 * read text per compile.
 */
export function refuseInheritedConstMemberReads(ir: ComponentIR, sink: NonPrimitiveEqualitySink): void {
  const constants = ir.metadata.localConstants
  if (!constants?.length) return
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const check = (expr: ParsedExpr, scope: BindingScope, loc: SourceLocation): void => {
    for (const read of inheritedReads(expr, scope, constants)) record(exprToString(read), loc, sink)
  }
  const reads = ssrReads(ir, component)
  for (const { expr, loc, scope } of reads.positions) check(expr, scope, loc)
  for (const declaration of [...reads.memos, ...reads.constants]) {
    for (const expr of declarationExprs(declaration)) check(expr, component, declaration.loc)
  }
  for (const fn of reads.functions) {
    const scope = component.enterCallback(functionLocalNames(fn))
    for (const expr of declarationExprs(fn)) check(expr, scope, fn.loc)
  }
}

function record(read: string, loc: SourceLocation, sink: NonPrimitiveEqualitySink): void {
  const message =
    `\`${read}\` reads a key the const's literal value does not have but its prototype does, so JS reads an inherited ` +
    'function there. A template holds the literal value without a prototype, so the server render cannot give the JS answer.'
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: {
      message: 'Read a key the literal lists, or defer the read to the client with /* @client */.',
      escape: [{ kind: 'client-directive' }],
    },
  })
}
