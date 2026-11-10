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
 * position, each read in its own scope, and over the bodies of the memos
 * those positions read (`memosEvaluatedAtSsr`).
 */

import { exprToString, type ParsedExpr } from '../expression-parser.ts'
import { parsedExprChildren } from '../action-accessor.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { readStaticConstMember, staticIndexKey } from '../static-const-member.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR, MemoInfo, SourceLocation } from '../types.ts'
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
 * Record BF101 for every literal const member read in `ir`'s template
 * positions, and in the body of each memo such a position reads, that only
 * the prototype answers. One error per read text per compile.
 */
export function refuseInheritedConstMemberReads(ir: ComponentIR, sink: NonPrimitiveEqualitySink): void {
  const constants = ir.metadata.localConstants
  if (!constants?.length) return
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const check = (expr: ParsedExpr, scope: BindingScope, loc: SourceLocation): void => {
    for (const read of inheritedReads(expr, scope, constants)) record(exprToString(read), loc, sink)
  }
  const ssrNames = new Set<string>()
  walkTemplatePositions(ir.root, ({ expr, loc, scope }) => {
    check(expr, scope ?? component, loc)
    collectNames(expr, ssrNames)
  }, component)
  for (const memo of memosEvaluatedAtSsr(ir.metadata, ssrNames)) {
    if (memo.parsed) check(memo.parsed, component, ir.root.loc)
  }
}

/**
 * The memos a backend evaluates at SSR: those a template position reads,
 * directly or through another memo or a component constant — the rule
 * `checkAsyncActionReads` (BF117) applies, "every backend evaluates a memo
 * or constant it renders". A memo read only from `/* @client *\/`
 * positions (which `walkTemplatePositions` skips), and a module-scope memo,
 * runs in the browser only.
 */
function memosEvaluatedAtSsr(metadata: ComponentIR['metadata'], read: ReadonlySet<string>): MemoInfo[] {
  const memos = new Map((metadata.memos ?? []).filter(m => !m.isModule).map(m => [m.name, m]))
  const constants = new Map((metadata.localConstants ?? []).map(c => [c.name, c]))
  const reached = new Map<string, MemoInfo>()
  const visited = new Set<string>()
  const pending = [...read]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (visited.has(name)) continue
    visited.add(name)
    const memo = memos.get(name)
    if (memo) {
      reached.set(name, memo)
      pending.push(...namesRead(memo.computationFreeIdentifiers, memo.parsed))
      continue
    }
    const constant = constants.get(name)
    if (constant) pending.push(...namesRead(constant.freeIdentifiers, constant.parsed))
  }
  return [...reached.values()]
}

/**
 * The names a declaration reads: its recorded free identifiers, else every
 * identifier in its parse. The recorded set is only trusted as a `Set`: an IR
 * that went through a JSON round trip (a cached compile) carries it as `{}`.
 */
function namesRead(free: ReadonlySet<string> | undefined, parsed: ParsedExpr | undefined): Iterable<string> {
  if (free instanceof Set) return free
  const names = new Set<string>()
  if (parsed) collectNames(parsed, names)
  return names
}

/** Every identifier `expr` names (an over-approximation of its free names: a callback param counts too). */
function collectNames(expr: ParsedExpr, into: Set<string>): void {
  if (expr.kind === 'identifier') into.add(expr.name)
  for (const child of parsedExprChildren(expr)) collectNames(child.expr, into)
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
