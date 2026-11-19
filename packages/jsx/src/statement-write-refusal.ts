/**
 * `checkStatementWrites` (#3719, BF101): a binding a component-body statement
 * writes after its declaration (`local.push('z')`, `label = other()`,
 * `config[k] = v` in a loop) is refused where the compiled output would read
 * the value it had before the statement ran. Uniform across every adapter,
 * Hono included.
 *
 * A template renders a binding from its declaration: the server templates,
 * the reference adapter's server function and the client template all carry
 * the component body's declarations, never the statements between them. The
 * client's init does run the statements, but after every signal, memo and
 * constant is declared. So two reads see the declared value where JavaScript
 * sees the written one:
 *
 *   - **A server read.** A template position (text, an element attribute, a
 *     condition, a loop array), or a signal seed, memo, constant or inlined
 *     function it reads through, reaches the written binding. Deferring the
 *     position to the client with `/* @client *\/` skips it: the client
 *     evaluates the position after the statements ran.
 *   - **An init-time read after the write.** In a client component, a signal
 *     seed, a memo or a constant declared after the statement reads the
 *     binding, directly or through a function it calls. Init computes it
 *     before the statement runs, whoever reads it later, so `/* @client *\/`
 *     is no way out.
 *
 * A value handed on as a component prop or a provider value is not refused:
 * the client's init passes the receiver the live binding, and what the
 * receiver does with it on the server is not this component's to know. A
 * write inside a function literal in the statement is not a write here
 * (`InitStatementInfo.assignedIdentifiers` / `mutatedIdentifiers` stop at
 * one): an event listener or a timer callback runs later, where every reader
 * sees it. A callback the statement runs in place
 * (`xs.forEach(x => out.push(x))`) is not told apart from those, so its
 * write is not seen either.
 *
 * A pure `let` reassignment directly after its declaration never reaches
 * this check: `foldRenderReassignmentsInSource` folds it into the
 * initializer, and no statement is left.
 */

import { localBindings, type LocalBindingResolver } from './local-call-body.ts'
import { walkServerReads } from './server-read-walk.ts'
import type { CompilerError, ComponentIR, InitStatementInfo, IRMetadata, SourceLocation } from './types.ts'

/** A declaration init evaluates where it stands, with the names its expression reads. */
interface EagerDeclaration {
  subject: string
  loc: SourceLocation
  reads: ReadonlySet<string> | undefined
}

/** Record BF101 for each binding a body statement writes that a server read or a later init-time read reaches. */
export function checkStatementWrites(ir: ComponentIR, errors: CompilerError[]): void {
  const resolve = localBindings({ ...ir.metadata, localConstants: ir.metadata.localConstants ?? [] })
  const writers = statementWriters(ir.metadata.initStatements ?? [], resolve)
  if (writers.size === 0) return
  const refused = new Set<string>()
  const refuse = (name: string, error: CompilerError): void => {
    if (refused.has(name)) return
    refused.add(name)
    errors.push(error)
  }

  if (ir.metadata.isClientComponent) {
    const lazy = lazyReads(ir.metadata)
    for (const declaration of eagerDeclarations(ir.metadata)) {
      for (const name of reachedNames(declaration.reads, lazy)) {
        const writer = writers.get(name)
        if (writer && isAfter(declaration.loc, writer.loc)) refuse(name, initReadError(name, declaration, writer))
      }
    }
  }

  walkServerReads(
    ir,
    (read) => {
      const writer = writers.get(read.name)
      // A module const the component hides under the same name is not the binding the statement writes.
      if (writer && resolve(read.name, 'component')?.scope === read.scope) refuse(read.name, serverReadError(read.name, writer))
    },
    {
      visitProp: (name) => {
        const writer = writers.get(name)
        if (writer) refuse(name, serverReadError(name, writer))
      },
      startsAt: position => position.role !== 'prop',
    },
  )
}

/**
 * The first statement that writes each binding the component or its module
 * declares: a constant (`const` or `let`), a prop, the props object. Signals,
 * memos and functions hold no value a statement's write changes for a reader.
 */
function statementWriters(statements: readonly InitStatementInfo[], resolve: LocalBindingResolver): Map<string, InitStatementInfo> {
  const writers = new Map<string, InitStatementInfo>()
  for (const statement of statements) {
    for (const names of [statement.assignedIdentifiers, statement.mutatedIdentifiers]) {
      // An IR that went through JSON holds no `Set`: nothing to read there.
      if (!(names instanceof Set)) continue
      for (const name of names) {
        const kind = resolve(name, 'component')?.kind
        if ((kind === 'const' || kind === 'opaque') && !writers.has(name)) writers.set(name, statement)
      }
    }
  }
  return writers
}

/** The component's declarations init evaluates in place: constants that are not functions, signal seeds, memos. */
function eagerDeclarations(metadata: IRMetadata): EagerDeclaration[] {
  const declarations: EagerDeclaration[] = []
  for (const c of metadata.localConstants ?? []) {
    if (c.isModule || isLazyConstant(c)) continue
    declarations.push({ subject: `'${c.name}'`, loc: c.loc, reads: c.freeIdentifiers })
  }
  for (const s of metadata.signals) {
    if (s.isModule || s.envReader) continue
    declarations.push({ subject: `Signal '${s.getter}'`, loc: s.loc, reads: s.initialFreeIdentifiers })
  }
  for (const m of metadata.memos) {
    if (m.isModule) continue
    declarations.push({ subject: `Memo '${m.name}'`, loc: m.loc, reads: m.computationFreeIdentifiers })
  }
  return declarations
}

/** A constant whose value is a function or JSX: its body runs when it is called or rendered, not where it is declared. */
function isLazyConstant(c: IRMetadata['localConstants'][number]): boolean {
  return Boolean(c.isFunctionValue || c.isJsx || c.isJsxFunction || c.parsed?.kind === 'arrow')
}

/** The names each of the component's functions reads, by the function's name. */
function lazyReads(metadata: IRMetadata): Map<string, ReadonlySet<string> | undefined> {
  const lazy = new Map<string, ReadonlySet<string> | undefined>()
  for (const f of metadata.localFunctions) lazy.set(f.name, f.freeIdentifiers)
  for (const c of metadata.localConstants ?? []) {
    if (!c.isModule && isLazyConstant(c)) lazy.set(c.name, c.freeIdentifiers)
  }
  return lazy
}

/** The names `reads` reaches: its own, and those of every function among them, transitively. */
function reachedNames(reads: ReadonlySet<string> | undefined, lazy: ReadonlyMap<string, ReadonlySet<string> | undefined>): Set<string> {
  const reached = new Set<string>()
  const pending: Array<ReadonlySet<string> | undefined> = [reads]
  while (pending.length > 0) {
    const next = pending.pop()
    if (!(next instanceof Set)) continue
    for (const name of next) {
      if (reached.has(name)) continue
      reached.add(name)
      if (lazy.has(name)) pending.push(lazy.get(name))
    }
  }
  return reached
}

function isAfter(a: SourceLocation, b: SourceLocation): boolean {
  return a.start.line > b.start.line || (a.start.line === b.start.line && a.start.column > b.start.column)
}

const REWRITE = (name: string): string =>
  `Give '${name}' its final value where it is declared (build the array, object or string in one expression)`

function serverReadError(name: string, writer: InitStatementInfo): CompilerError {
  return {
    code: 'BF101',
    severity: 'error',
    message:
      `'${name}' is written by a statement in the component body (line ${writer.loc.start.line}) and read by the server render. ` +
      `A template renders a binding from its declaration and does not run the statements after it, so the server would ` +
      `render '${name}' as it was declared where JS renders what the statement wrote.`,
    loc: writer.loc,
    suggestion: {
      message: `${REWRITE(name)}, or defer the reads of '${name}' to the client with /* @client */.`,
      escape: [{ kind: 'rewrite' }, { kind: 'client-directive' }],
    },
  }
}

function initReadError(name: string, declaration: EagerDeclaration, writer: InitStatementInfo): CompilerError {
  return {
    code: 'BF101',
    severity: 'error',
    message:
      `${declaration.subject} reads '${name}' after a statement in the component body writes it (line ${writer.loc.start.line}). ` +
      `The client's init declares the component's signals, memos and constants before it runs the body's statements, so ` +
      `${declaration.subject} would be computed from '${name}' as it was declared where JS computes it from what the statement wrote.`,
    loc: writer.loc,
    suggestion: {
      message: `${REWRITE(name)}.`,
      escape: [{ kind: 'rewrite' }],
    },
  }
}
