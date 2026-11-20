/**
 * BF101 for a value the server render reads that holds an array literal with
 * an element no template lowers (#3954): a spread (`[...b, 'z']`), whose
 * parse is an `unsupported` element.
 *
 * Written in markup, such a literal is refused by the emitter that spells it,
 * directly or once `inlineComputedConsts` has put a const's initializer in
 * place of its name (`local.length` for `const local = [...b, 'z']`). A
 * signal's seed and a memo's body are computed apart from any emitter: the
 * SSR seed plan classifies them opaque, the static evaluator has no value for
 * the element, and Go's constructor leaves a value it cannot compute out (a
 * child prop's field too). The value then renders empty, or `0`, where JS
 * renders the computed array. This is the refusal for those positions.
 *
 * Only a value the server render reads is refused, however it is reached
 * (`walkServerReads`): a signal, a memo, a const initializer or an inlined
 * function, each name resolved lexically. A `/* @client *\/` read and an
 * event handler read none. Within an expression only what its evaluation
 * runs is checked (`walkEvaluated`): a function is entered where it is called
 * or handed to a call (a callback, a literal const's method called by name),
 * not where it is stored (an object const's method read for another key).
 */

import { evaluatedWalkContext, walkEvaluated, type EvaluatedAt, type EvaluatedWalkContext } from '../evaluated-expr-walk.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import { isEventHandlerName } from '../event-handler-name.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR, SourceLocation } from '../types.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each position and declaration the server render reads that holds an array literal with an unlowered element. */
export function refuseUnloweredArrayElements(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  // A component renders on the server whatever directive its prop carries, so
  // a declaration a child prop reads has no `/* @client */` escape.
  const readByProp = new Set<string>()
  walkServerReads(ir, read => readByProp.add(readKey(read)), { startsAt: position => position.role === 'prop' })
  const ctx = evaluatedWalkContext(ir.metadata, { component: BindingScope.EMPTY, module: BindingScope.EMPTY })
  // A position reaches the literal through a function it calls (`{api.add()}`),
  // which no emitter spells, or as a child prop Go's constructor drops.
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  walkTemplatePositions(ir.root, ({ expr, scope, attrName, loc, role }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    if (holdsUnloweredArrayElement(expr, { scope: scope ?? component, from: 'component' }, ctx)) {
      recordPosition(loc, role !== 'prop', sink)
    }
  }, component)
  walkServerReads(ir, (read) => {
    // A module-scope declaration (`const ALL = [...BASE, 'z']` at the top of
    // the file) is out of this refusal's scope: its reads are left as they are.
    if (read.scope === 'module' || !read.expr) return
    if (holdsUnloweredArrayElement(read.expr, { scope: BindingScope.EMPTY, from: read.scope }, ctx)) {
      record(read, !readByProp.has(readKey(read)), sink)
    }
  })
}

function readKey(read: ServerRead): string {
  return `${read.scope}:${read.kind}:${read.name}`
}

/**
 * Whether evaluating `expr` builds an array literal with an `unsupported`
 * element: a stored function builds nothing until it is called, a literal
 * const's method called by name (`api.add()`) builds what its body does.
 */
function holdsUnloweredArrayElement(expr: ParsedExpr, at: EvaluatedAt, ctx: EvaluatedWalkContext): boolean {
  let found = false
  walkEvaluated(expr, at, { ...ctx, entered: new Set() }, (e) => {
    if (e.kind === 'array-literal' && e.elements.some(el => el.kind === 'unsupported')) found = true
  })
  return found
}

const SUBJECT: Record<ServerRead['kind'], (name: string) => string> = {
  signal: name => `Signal '${name}' is seeded from`,
  memo: name => `Memo '${name}' computes`,
  const: name => `'${name}' is initialized from`,
  function: name => `Function '${name}' returns`,
}

function record(read: ServerRead, deferrable: boolean, sink: UninlinableSeedCallSink): void {
  const { name } = read
  const message =
    `${SUBJECT[read.kind](name)} an array literal with an element no template lowers (a spread, \`[...xs, y]\`). ` +
    `The server render would show '${name}' empty where JS shows the computed array.`
  push(message, read.loc, deferrable ? `the reads of '${name}'` : null, sink)
}

function recordPosition(loc: SourceLocation, deferrable: boolean, sink: UninlinableSeedCallSink): void {
  const message =
    'This expression builds an array literal with an element no template lowers (a spread, `[...xs, y]`), ' +
    'in place or in a function it calls. The server render would show it empty where JS shows the computed value.'
  push(message, loc, deferrable ? 'the read' : null, sink)
}

/** Record one BF101; `deferred` names what `/* @client *\/` defers, `null` where it defers nothing. */
function push(message: string, loc: SourceLocation, deferred: string | null, sink: UninlinableSeedCallSink): void {
  const same = (at: SourceLocation): boolean => at.start.line === loc.start.line && at.start.column === loc.start.column
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message && same(e.loc))) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: deferred
      ? {
          message: `List the elements without a spread, or defer ${deferred} to the client with /* @client */.`,
          escape: [{ kind: 'client-directive' }],
        }
      : { message: 'List the elements without a spread.' },
  })
}
