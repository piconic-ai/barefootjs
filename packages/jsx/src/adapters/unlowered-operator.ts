/**
 * BF101 for a value the server render reads that applies an operator no
 * template lowers (#3981): `typeof x`, `a ** b`, a bitwise or shift
 * operator, `~x`, `k in o`, `o instanceof C` (`unloweredOperator`).
 *
 * Written in markup, such an operator is refused by the emitter that spells
 * it (the support check refuses the same operators). A signal's seed, a
 * memo's body, a const's initializer and a called function's returned
 * expression are computed apart from any emitter: the SSR seed plan
 * classifies them opaque, the static evaluator has no value for the
 * operator, and Go's constructor leaves the value out. The value then
 * renders empty, or `0`, where JS renders the computed one. This is the
 * refusal for those declarations, and for a child prop's value, which Go's
 * constructor drops the same way.
 *
 * Only a declaration the server render reads is refused, however it is
 * reached (`walkServerReads`), and within its expression only what its
 * evaluation runs (`walkEvaluated`): an operator in a callback handed to a
 * call is refused, one in a function stored and never called is not. A
 * `/* @client *\/` read and an event handler read none.
 */

import { evaluatedWalkContext, walkEvaluated, type EvaluatedAt, type EvaluatedWalkContext } from '../evaluated-expr-walk.ts'
import { unloweredOperator, type ParsedExpr } from '../expression-parser.ts'
import { isEventHandlerName } from '../event-handler-name.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR, SourceLocation } from '../types.ts'
import { childPropReads } from './unlowered-array-element.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each declaration the server render reads that applies an operator no template lowers. */
export function refuseUnloweredOperators(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  const readByProp = childPropReads(ir)
  const ctx = evaluatedWalkContext(ir.metadata, { component: BindingScope.EMPTY, module: BindingScope.EMPTY })
  // A child prop's value is computed apart from any emitter too (Go's
  // constructor drops it); markup positions are refused by their emitters.
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  walkTemplatePositions(ir.root, ({ expr, scope, attrName, loc, role }) => {
    if (role !== 'prop' || (attrName !== undefined && isEventHandlerName(attrName))) return
    const node = firstUnloweredOperator(expr, { scope: scope ?? component, from: 'component' }, ctx)
    if (node !== null) recordChildProp(attrName, operatorText(node), loc, sink)
  }, component)
  const rootOperators = unloweredRootOperators(ir)
  walkServerReads(ir, (read) => {
    // A module-scope declaration is out of scope, as for the array-element refusal.
    if (read.scope === 'module') return
    if (!read.expr) {
      const operator = read.kind === 'signal' || read.kind === 'memo' ? rootOperators.get(read.name) : undefined
      if (operator) record(read, `\`${operator}\``, !readByProp(read), sink)
      return
    }
    const node = firstUnloweredOperator(read.expr, { scope: BindingScope.EMPTY, from: read.scope }, ctx)
    if (node !== null) record(read, operatorText(node), !readByProp(read), sink)
  })
}

/**
 * The component signals and memos whose value expression is, at its root,
 * an operator no template lowers, by the name they are read under. Their
 * `parsed` is unset (an `unsupported` root), so the analyzer records the
 * operator apart (`unloweredRootOperator`).
 */
function unloweredRootOperators(ir: ComponentIR): ReadonlyMap<string, string> {
  const operators = new Map<string, string>()
  for (const s of ir.metadata.signals) if (!s.isModule && s.unloweredRootOperator) operators.set(s.getter, s.unloweredRootOperator)
  for (const m of ir.metadata.memos) if (!m.isModule && m.unloweredRootOperator) operators.set(m.name, m.unloweredRootOperator)
  return operators
}

/** The first node evaluating `expr` runs that applies an operator no template lowers, or `null`. */
function firstUnloweredOperator(expr: ParsedExpr, at: EvaluatedAt, ctx: EvaluatedWalkContext): ParsedExpr | null {
  let found: ParsedExpr | null = null
  walkEvaluated(expr, at, { ...ctx, entered: new Set() }, (e) => {
    if (found === null && unloweredOperator(e) !== null) found = e
  })
  return found
}

const SUBJECT: Record<ServerRead['kind'], (name: string) => string> = {
  signal: name => `Signal '${name}' is seeded from`,
  memo: name => `Memo '${name}' computes`,
  const: name => `'${name}' is initialized from`,
  function: name => `Function '${name}' returns`,
}

/** How the message names the operator of `node`: an `'unknown'` one parsed without its token. */
function operatorText(node: ParsedExpr): string {
  const operator = unloweredOperator(node)
  if (operator !== 'unknown') return `\`${operator}\``
  return node.kind === 'binary'
    ? 'a binary operator other than comparison and arithmetic (`**`, a bitwise or shift operator, `in`, `instanceof`)'
    : 'a prefix `++` / `--`'
}

const FIX = 'Pre-compute the value in the backend and pass it as a prop'

function record(read: ServerRead, operator: string, deferrable: boolean, sink: UninlinableSeedCallSink): void {
  const { name } = read
  const message =
    `${SUBJECT[read.kind](name)} an expression applying ${operator}, which no template lowers. ` +
    `The server render would show '${name}' empty where JS shows the computed value.`
  push(message, read.loc, deferrable ? name : null, sink)
}

function recordChildProp(prop: string | undefined, operator: string, loc: SourceLocation, sink: UninlinableSeedCallSink): void {
  const message =
    `Child prop${prop === undefined ? '' : ` '${prop}'`} is passed an expression applying ${operator}, which no template lowers. ` +
    'The child would render it empty where JS renders the computed value.'
  push(message, loc, null, sink)
}

/** Record one BF101; `deferred` names the declaration whose reads `/* @client *\/` defers, `null` where it defers nothing. */
function push(message: string, loc: SourceLocation, deferred: string | null, sink: UninlinableSeedCallSink): void {
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message && e.loc.start.line === loc.start.line && e.loc.start.column === loc.start.column)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: deferred
      ? { message: `${FIX}, or defer the reads of '${deferred}' to the client with /* @client */.`, escape: [{ kind: 'client-directive' }] }
      : { message: `${FIX}.` },
  })
}
