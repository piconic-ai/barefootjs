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

import { evaluatedWalkContext, walkEvaluated, type EvaluatedWalkContext } from '../evaluated-expr-walk.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import type { LocalScope } from '../local-call-body.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import type { ComponentIR } from '../types.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each declaration the server render reads that holds an array literal with an unlowered element. */
export function refuseUnloweredArrayElements(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  // A component renders on the server whatever directive its prop carries, so
  // a declaration a child prop reads has no `/* @client */` escape.
  const readByProp = new Set<string>()
  walkServerReads(ir, read => readByProp.add(readKey(read)), { startsAt: position => position.role === 'prop' })
  // A function called by its own name is a declaration of its own, refused there.
  const ctx = evaluatedWalkContext(ir.metadata, { component: BindingScope.EMPTY, module: BindingScope.EMPTY }, false)
  walkServerReads(ir, (read) => {
    // A module-scope declaration (`const ALL = [...BASE, 'z']` at the top of
    // the file) is out of this refusal's scope: its reads are left as they are.
    if (read.scope === 'module' || !read.expr) return
    if (holdsUnloweredArrayElement(read.expr, read.scope, ctx)) record(read, !readByProp.has(readKey(read)), sink)
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
function holdsUnloweredArrayElement(expr: ParsedExpr, from: LocalScope, ctx: EvaluatedWalkContext): boolean {
  let found = false
  walkEvaluated(expr, { scope: BindingScope.EMPTY, from }, { ...ctx, entered: new Set() }, (e) => {
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
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc: read.loc,
    suggestion: deferrable
      ? {
          message: `List the elements without a spread, or defer the reads of '${name}' to the client with /* @client */.`,
          escape: [{ kind: 'client-directive' }],
        }
      : { message: 'List the elements without a spread.' },
  })
}
