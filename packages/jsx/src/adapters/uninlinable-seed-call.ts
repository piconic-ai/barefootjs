/**
 * BF101 for a value the server render reads that calls a function a
 * template cannot inline (#3721).
 *
 * A template computes a signal's or memo's SSR value from its seed or body
 * (the SSR seed plan, the static SSR defaults, Go's constructor), and a
 * const's from its initializer. A zero-argument call of a local function is
 * read there as the expression the function returns (`localCall`'s
 * `inline`); a call of any other local function (`refuse`: parameters, a
 * body other than a single `return`) has no value a template can compute,
 * so the value would render as its empty static default where JS renders
 * the call's result. The same call written in markup is refused by the
 * shared inlining (`inlineComputedConsts`); this is the refusal for the
 * value positions that inlining never sees.
 *
 * Only a value the server render reads is refused, however it is reached
 * (`walkServerReads`): through a signal, a memo, a const initializer or an
 * inlined function, each name resolved lexically. A `/* @client *\/` read
 * and a loop row named like a component value read none.
 */

import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import type { CompilerError, ComponentIR, SourceLocation } from '../types.ts'

/** Where {@link refuseUninlinableSeedCalls} records its errors. */
export interface UninlinableSeedCallSink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/** Record BF101 for each declaration the server render reads that calls an uninlinable local function. */
export function refuseUninlinableSeedCalls(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  walkServerReads(ir, (read) => {
    for (const fn of read.refusedCalls) record(read.kind, read.name, fn, read.loc, sink)
  })
}

const SUBJECT: Record<ServerRead['kind'], (name: string) => string> = {
  signal: name => `Signal '${name}' is seeded from`,
  memo: name => `Memo '${name}' computes`,
  const: name => `'${name}' is initialized from`,
  function: name => `Function '${name}' returns`,
}

function record(kind: ServerRead['kind'], name: string, fn: string, loc: SourceLocation, sink: UninlinableSeedCallSink): void {
  const what = SUBJECT[kind](name)
  const message =
    `${what} '${fn}()', a call of a function a template cannot compute: only a function that takes no parameters and ` +
    `whose body is a single 'return <expr>' is read on the server, as the expression it returns. The server render ` +
    `would show '${name}' empty where JS shows the call's result.`
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: {
      message: `Make '${fn}' a single 'return <expr>' with no parameters, or defer the reads of '${name}' to the client with /* @client */.`,
      escape: [{ kind: 'client-directive' }],
    },
  })
}
