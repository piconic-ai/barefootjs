/**
 * `checkStatementWrites` (#3719, BF101): a binding a component-body statement
 * writes after its declaration (`local.push('z')`, `label = other()`,
 * `config[k] = v` in a loop) is refused where the compiled output would read
 * the value it had before the statement ran while JavaScript reads the
 * written one. Uniform across every adapter, Hono included.
 *
 * A template renders a binding from its declaration: the server templates,
 * the reference adapter's server function and the client template all carry
 * the component body's declarations, never the statements between them. The
 * client's init does run the statements, but after every signal, memo and
 * constant is declared. So a read is wrong exactly where JavaScript
 * evaluates it AFTER the write:
 *
 *   - **A server read after the write.** The markup is evaluated last, so a
 *     template position (text, an element attribute, a condition, a loop
 *     array) that reads the written binding itself, or through a function it
 *     calls, observes the write. So does a signal seed, memo or constant the
 *     server render reads when it is declared after the statement. One
 *     declared BEFORE the statement was computed from the binding as
 *     declared in JavaScript too, and compiles, unless the write is in place
 *     and the declaration may hold the written object itself
 *     (`const alias = local`): then the markup reads the written object
 *     through it. Deferring a position to the client with `/* @client *\/`
 *     skips it: the client evaluates the position after the statements ran.
 *   - **An init-time read after the write.** In a client component, a signal
 *     seed, a memo or a constant declared after the statement reads the
 *     binding, directly or through a function it calls. Init computes it
 *     before the statement runs, whoever reads it later, so `/* @client *\/`
 *     is no way out.
 *
 * A write to one member of the props object (`props.items.push('z')`) is
 * observed only by a read of that member: `props.title` beside it compiles.
 * A write to the props object as a whole, or to a member no name stands for
 * (`props[key] = v`), is observed by every read of it
 * (`InitStatementInfo.mutatedMembers`).
 *
 * A value handed on as a component prop or a provider value is not refused:
 * the client's init passes the receiver the live binding, and what the
 * receiver does with it on the server is not this component's to know. A
 * write inside a function the statement only defines (an event listener, a
 * timer callback) is not a write here: it runs later, where every reader
 * sees it. A callback the statement runs where it stands
 * (`xs.forEach(x => out.push(x))`) is one.
 *
 * A pure `let` reassignment directly after its declaration never reaches
 * this check: `foldRenderReassignmentsInSource` folds it into the
 * initializer, and no statement is left.
 */

import { mapParsedExpr, type ParsedExpr } from './expression-parser.ts'
import { localBindings, type LocalBindingResolver } from './local-call-body.ts'
import { walkServerReads } from './server-read-walk.ts'
import type { CompilerError, ComponentIR, InitStatementInfo, IRMetadata, SourceLocation, TypeInfo } from './types.ts'

/** What the body's statements write to one binding. */
interface Writer {
  /** The first statement that writes it. */
  statement: InitStatementInfo
  /** The members written, when every write names one; `null` for a write to the whole binding. */
  members: Set<string> | null
  /** Whether a statement changes the value in place (as opposed to rebinding the name). */
  inPlace: boolean
}

/** A declaration init evaluates where it stands, with the names its expression reads. */
interface EagerDeclaration {
  name: string
  subject: string
  loc: SourceLocation
  reads: ReadonlySet<string> | undefined
  expr: ParsedExpr | undefined
  type: TypeInfo | null | undefined
}

/** The members of a binding one expression reads; `null` for the whole binding, or an expression with no tree. */
type MembersRead = ReadonlySet<string> | null

/** What the three passes of {@link checkStatementWrites} share. */
interface Check {
  ir: ComponentIR
  resolve: LocalBindingResolver
  writers: ReadonlyMap<string, Writer>
  eager: readonly EagerDeclaration[]
  /** The written bindings a declaration reads, each with whether it is declared after the write. */
  writtenReads: (declaration: EagerDeclaration) => WrittenRead[]
  /** Record one error per written binding. */
  refuse: (name: string, error: CompilerError) => void
}

interface WrittenRead {
  name: string
  writer: Writer
  after: boolean
}

/** Record BF101 for each binding a body statement writes that a read evaluated after the write reaches. */
export function checkStatementWrites(ir: ComponentIR, errors: CompilerError[]): void {
  const resolve = localBindings({ ...ir.metadata, localConstants: ir.metadata.localConstants ?? [] })
  const writers = statementWriters(ir.metadata.initStatements ?? [], resolve)
  if (writers.size === 0) return
  const refused = new Set<string>()
  const lazy = lazyReads(ir.metadata)
  const check: Check = {
    ir,
    resolve,
    writers,
    eager: eagerDeclarations(ir.metadata),
    writtenReads: declaration => writtenReadsOf(declaration, writers, lazy, ir.metadata.propsObjectName ?? null),
    refuse: (name, error) => {
      if (refused.has(name)) return
      refused.add(name)
      errors.push(error)
    },
  }
  if (ir.metadata.isClientComponent) refuseInitReadsAfterWrite(check)
  refuseMarkupReads(check)
  refuseServerReadDeclarations(check)
}

/** The component's own markup is a server read; a value handed to a child or a provider is not. */
const startsAt = (position: { role: string }): boolean => position.role !== 'prop'

/** In a client component: a signal seed, memo or constant declared after the write, which init computes before it. */
function refuseInitReadsAfterWrite({ eager, writtenReads, refuse }: Check): void {
  for (const declaration of eager) {
    for (const { name, writer, after } of writtenReads(declaration)) {
      if (after) refuse(name, initReadError(name, declaration, writer.statement))
    }
  }
}

/** The markup's own reads, and those of the functions it calls: evaluated after every statement. */
function refuseMarkupReads({ ir, resolve, writers, refuse }: Check): void {
  const propsObject = ir.metadata.propsObjectName ?? null
  walkServerReads(
    ir,
    (read) => {
      const writer = writers.get(read.name)
      // A module const the component hides under the same name is not the binding the statement writes.
      if (writer && resolve(read.name, 'component')?.scope === read.scope) refuse(read.name, serverReadError(read.name, writer.statement))
    },
    {
      visitProp: (name, expr) => {
        const writer = writers.get(name)
        if (writer && overlaps(writer, name === propsObject ? membersRead(expr, name) : null)) refuse(name, serverReadError(name, writer.statement))
      },
      startsAt,
      followsThrough: read => read.kind === 'function',
    },
  )
}

/** The signal seeds, memos and constants the server render reads: each evaluated where it is declared. */
function refuseServerReadDeclarations({ ir, eager, writtenReads, refuse }: Check): void {
  const serverRead = new Set<string>()
  walkServerReads(ir, (read) => {
    if (read.scope === 'component' && read.kind !== 'function') serverRead.add(read.name)
  }, { startsAt })
  for (const declaration of eager) {
    if (!serverRead.has(declaration.name)) continue
    for (const { name, writer, after } of writtenReads(declaration)) {
      // Declared before the write, it holds the binding as declared, as in
      // JS, unless it may hold the object a statement then changes in place.
      if (after || (writer.inPlace && !holdsPrimitive(declaration))) refuse(name, serverReadError(name, writer.statement))
    }
  }
}

function writtenReadsOf(
  declaration: EagerDeclaration,
  writers: ReadonlyMap<string, Writer>,
  lazy: ReadonlyMap<string, ReadonlySet<string> | undefined>,
  propsObject: string | null,
): WrittenRead[] {
  const found: WrittenRead[] = []
  const reached = reachedNames(declaration.reads, lazy)
  for (const name of reached) {
    const writer = writers.get(name)
    if (!writer) continue
    // A member read is told apart only on the props object, and only when
    // the declaration's own expression is all that reads it.
    const throughFunction = [...reached].some(other => lazy.get(other)?.has(name))
    const members = name === propsObject && !throughFunction ? membersRead(declaration.expr, name) : null
    if (overlaps(writer, members)) found.push({ name, writer, after: isAfter(declaration.loc, writer.statement.loc) })
  }
  return found
}

/**
 * What the body's statements write to each binding the component or its
 * module declares: a constant (`const` or `let`), a prop, the props object.
 * Signals, memos and functions hold no value a statement's write changes for
 * a reader.
 */
function statementWriters(statements: readonly InitStatementInfo[], resolve: LocalBindingResolver): Map<string, Writer> {
  const writers = new Map<string, Writer>()
  const record = (name: string, statement: InitStatementInfo, members: ReadonlySet<string> | null, inPlace: boolean): void => {
    const kind = resolve(name, 'component')?.kind
    if (kind !== 'const' && kind !== 'opaque') return
    const known = writers.get(name)
    if (!known) {
      writers.set(name, { statement, members: members && new Set(members), inPlace })
      return
    }
    known.inPlace ||= inPlace
    if (members === null || known.members === null) known.members = null
    else for (const member of members) known.members.add(member)
  }
  for (const statement of statements) {
    // An IR that went through JSON holds no `Set` / `Map`: nothing to read there.
    if (statement.assignedIdentifiers instanceof Set) {
      for (const name of statement.assignedIdentifiers) record(name, statement, null, false)
    }
    if (statement.mutatedIdentifiers instanceof Set) {
      const members = statement.mutatedMembers instanceof Map ? statement.mutatedMembers : undefined
      for (const name of statement.mutatedIdentifiers) record(name, statement, members?.get(name) ?? null, true)
    }
  }
  return writers
}

/** Whether a read of `members` of a binding observes what `writer` writes to it. */
function overlaps(writer: Writer, members: MembersRead): boolean {
  if (writer.members === null || members === null) return true
  for (const member of members) if (writer.members.has(member)) return true
  return false
}

/**
 * The members of `name` that `expr` reads (`props.title` → `title`): `null`
 * when it reads the binding as a whole, through a computed member, or has no
 * analyzable tree. A name an enclosing arrow binds is not the binding.
 */
function membersRead(expr: ParsedExpr | undefined, name: string): MembersRead {
  if (!expr) return null
  const members = new Set<string>()
  let whole = false
  mapParsedExpr(expr, (e, enclosing) => {
    if (enclosing.has(name)) return null
    if (e.kind === 'member' && e.object.kind === 'identifier' && e.object.name === name) {
      if (e.computed) whole = true
      else members.add(e.property)
      return e
    }
    if (e.kind === 'identifier' && e.name === name) whole = true
    return null
  })
  return whole ? null : members
}

/** The component's declarations init evaluates in place: constants that are not functions, signal seeds, memos. */
function eagerDeclarations(metadata: IRMetadata): EagerDeclaration[] {
  const declarations: EagerDeclaration[] = []
  for (const c of metadata.localConstants ?? []) {
    if (c.isModule || isLazyConstant(c)) continue
    declarations.push({ name: c.name, subject: `'${c.name}'`, loc: c.loc, reads: c.freeIdentifiers, expr: c.parsed, type: c.type })
  }
  for (const s of metadata.signals) {
    if (s.isModule || s.envReader) continue
    declarations.push({ name: s.getter, subject: `Signal '${s.getter}'`, loc: s.loc, reads: s.initialFreeIdentifiers, expr: s.parsed, type: s.type })
  }
  for (const m of metadata.memos) {
    if (m.isModule) continue
    declarations.push({ name: m.name, subject: `Memo '${m.name}'`, loc: m.loc, reads: m.computationFreeIdentifiers, expr: m.parsed, type: m.type })
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

/**
 * Whether `declaration`'s value is a primitive, which cannot be an object a
 * later statement changes in place: by its type, or by the shape of its
 * expression. `false` when neither says so.
 */
function holdsPrimitive(declaration: EagerDeclaration): boolean {
  if (declaration.type?.kind === 'primitive') return true
  return declaration.expr !== undefined && yieldsPrimitive(declaration.expr)
}

/** Array and string methods that return a primitive whatever they are called on. */
const PRIMITIVE_METHODS: ReadonlySet<string> = new Set(['join', 'includes', 'indexOf', 'lastIndexOf', 'some', 'every', 'toString'])
/** Global conversions that return a primitive. */
const PRIMITIVE_CONVERSIONS: ReadonlySet<string> = new Set(['String', 'Number', 'Boolean'])

/** Whether `expr` evaluates to a primitive whatever its operands hold. */
function yieldsPrimitive(expr: ParsedExpr): boolean {
  switch (expr.kind) {
    case 'literal':
    case 'template-literal':
    case 'unary':
    case 'binary':
      return true
    case 'member':
      return !expr.computed && expr.property === 'length'
    case 'conditional':
      return yieldsPrimitive(expr.consequent) && yieldsPrimitive(expr.alternate)
    case 'logical':
      return yieldsPrimitive(expr.left) && yieldsPrimitive(expr.right)
    case 'call':
      if (expr.callee.kind === 'identifier') return PRIMITIVE_CONVERSIONS.has(expr.callee.name)
      return expr.callee.kind === 'member' && !expr.callee.computed && PRIMITIVE_METHODS.has(expr.callee.property)
    default:
      return false
  }
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
