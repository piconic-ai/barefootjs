/**
 * BF101 for a const or `let`, module or component scope, the server render
 * reads whose initializer calls a function literal where it stands, in a form the
 * analyzer cannot record as the value it returns (#4022): a block body
 * (`(() => { return x })()`, `(function () { … })()`), a parameter
 * (`((a) => …)(v)`), a body that does not evaluate to the same value each
 * time (`(() => new Date(0))()`), or any such call in a `let`.
 *
 * The template receives the props, not the component's or the module's
 * consts, and no template evaluates the call, so every read of the const
 * rendered empty (or failed the render) where JS renders what the function
 * returns. A repeatable applied zero-param arrow
 * initializing a `const` (`(() => ({ k: V }))()`) is not refused: the
 * analyzer records the const as its body (`repeatableAppliedArrowValue`),
 * which the adapters lower like any other initializer.
 *
 * Only a value the server render reads is refused (`walkServerReads`): a
 * `/* @client *\/` read and an event handler read none.
 */

import type { ComponentIR } from '../types.ts'
import { walkServerReads, type ServerRead } from '../server-read-walk.ts'
import type { UninlinableSeedCallSink } from './uninlinable-seed-call.ts'

/** Record BF101 for each const the server render reads whose initializer calls a function literal (`ConstantInfo.callsFunctionLiteral`). */
export function refuseUnloweredIifeConsts(ir: ComponentIR, sink: UninlinableSeedCallSink): void {
  const refused = new Set<string>()
  for (const c of ir.metadata.localConstants ?? []) {
    if (c.callsFunctionLiteral) refused.add(declarationKey(c.isModule ? 'module' : 'component', c.name))
  }
  if (refused.size === 0) return
  // A component renders on the server whatever directive its prop carries, so
  // a const a child prop reads has no `/* @client */` escape.
  const readByProp = new Set<string>()
  walkServerReads(ir, (read) => {
    if (isRefused(read, refused)) readByProp.add(declarationKey(read.scope, read.name))
  }, { startsAt: position => position.role === 'prop' })
  walkServerReads(ir, (read) => {
    if (isRefused(read, refused)) record(read, !readByProp.has(declarationKey(read.scope, read.name)), sink)
  })
}

function declarationKey(scope: ServerRead['scope'], name: string): string {
  return `${scope}:${name}`
}

function isRefused(read: ServerRead, refused: ReadonlySet<string>): boolean {
  return read.kind === 'const' && refused.has(declarationKey(read.scope, read.name))
}

function record(read: ServerRead, deferrable: boolean, sink: UninlinableSeedCallSink): void {
  const { name, loc } = read
  const same = (e: { loc: typeof loc }): boolean => e.loc.start.line === loc.start.line && e.loc.start.column === loc.start.column
  const message =
    `'${name}' is initialized by calling a function literal in place, which no template evaluates ` +
    `(a block body, a parameter, or a body that does not give the same value each time). ` +
    `The server render would show '${name}' empty where JS shows what the function returns.`
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message && same(e))) return
  const rewrite = `Write the value the function returns as the initializer (\`const ${name} = value\`)`
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: deferrable
      ? { message: `${rewrite}, or defer the reads of '${name}' to the client with /* @client */.`, escape: [{ kind: 'client-directive' }] }
      : { message: `${rewrite}.` },
  })
}
