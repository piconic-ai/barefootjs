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
 * event handler read none. Within an expression a function is entered only
 * where it is called or handed to a call (a callback), not where it is stored
 * (an object const's method read for another key).
 */

import { parsedExprChildren } from '../action-accessor.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import type { ComponentIR, SourceLocation } from '../types.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each declaration the server render reads that holds an array literal with an unlowered element. */
export function refuseUnloweredArrayElements(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  walkServerReads(ir, (read) => {
    if (read.expr && holdsUnloweredArrayElement(read.expr, 'value')) record(read.kind, read.name, read.loc, sink)
  })
}

/** How the expression being visited is used: its value, or a function a call runs. */
type Use = 'value' | 'called'

/** Whether evaluating `expr` builds an array literal with an `unsupported` element. */
function holdsUnloweredArrayElement(expr: ParsedExpr, use: Use): boolean {
  // A stored function builds nothing until it is called.
  if (expr.kind === 'arrow' && use === 'value') return false
  if (expr.kind === 'array-literal' && expr.elements.some(el => el.kind === 'unsupported')) return true
  const called = expr.kind === 'call' || expr.kind === 'array-method'
  return parsedExprChildren(expr).some(child => holdsUnloweredArrayElement(child.expr, called ? 'called' : 'value'))
}

const SUBJECT: Record<ServerRead['kind'], (name: string) => string> = {
  signal: name => `Signal '${name}' is seeded from`,
  memo: name => `Memo '${name}' computes`,
  const: name => `'${name}' is initialized from`,
  function: name => `Function '${name}' returns`,
}

function record(kind: ServerRead['kind'], name: string, loc: SourceLocation, sink: UninlinableSeedCallSink): void {
  const message =
    `${SUBJECT[kind](name)} an array literal with an element no template lowers (a spread, \`[...xs, y]\`). ` +
    `The server render would show '${name}' empty where JS shows the computed array.`
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: {
      message: `List the elements without a spread, or defer the reads of '${name}' to the client with /* @client */.`,
      escape: [{ kind: 'client-directive' }],
    },
  })
}
