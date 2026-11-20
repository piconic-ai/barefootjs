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
 *     declared in JavaScript too, and compiles when what it took from the
 *     binding cannot change afterwards: a primitive (`local.length`), or a
 *     copy of an array or object whose own slots are what the statement
 *     changes (`[...local]` before `local.push('z')`). It is refused when
 *     the write is in place and it may hold the written object itself
 *     (`const alias = local`), or a copy that shares the object written
 *     (`[...rows]` before `rows[0].done = true`): the markup then reads the
 *     written object through it. Deferring a position to the client with
 *     `/* @client *\/` skips it: the client evaluates the position after the
 *     statements ran.
 *   - **An init-time read after the write.** In a client component, a signal
 *     seed, a memo or a constant declared after the statement computes
 *     something from the binding when it is created, directly or through a
 *     function it calls. Init creates it before the statement runs, whoever
 *     reads it later, so `/* @client *\/` is no way out. A declaration that
 *     only captures the binding in a function it creates
 *     (`{ read: () => local.length }`), or stores a function without calling
 *     it, reads nothing yet and compiles; so does one that only holds an
 *     object a statement changes in place (`const alias = local`), which is
 *     the same object once the statement ran.
 *
 * Which of these a declaration does with each name is a Phase 1 fact
 * (`valueUses`, `value-uses.ts`). A declaration also uses what the other
 * signals, memos, constants and functions it uses hold or read, transitively
 * (`usesThroughOthers`): `box.read()` after `const box = { read: () =>
 * local.length }` runs the closure where it stands, and `alias.length` after
 * `const alias = local` reads `local`, wherever `box` and `alias` are
 * declared.
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
import type { ValueUse } from './value-uses.ts'

/** What the body's statements write to one binding. */
interface Writer {
  /** The first statement that writes it. */
  statement: InitStatementInfo
  /** The members written, when every write names one; `null` for a write to the whole binding. */
  members: Set<string> | null
  /** Whether a statement changes the value in place. */
  inPlace: boolean
  /** Whether a statement rebinds the name. */
  reassigned: boolean
  /** Whether an in-place write changes an object the value holds, not the value's own slots. */
  deep: boolean
}

/** A declaration init evaluates where it stands, with the names its expression reads. */
interface EagerDeclaration {
  name: string
  subject: string
  loc: SourceLocation
  reads: ReadonlySet<string> | undefined
  /** How evaluating it uses each name; unset when Phase 1 recorded none. */
  uses: ReadonlyMap<string, ReadonlySet<ValueUse>> | undefined
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
  /** Whether the declaration is declared after the first statement that writes the binding. */
  after: boolean
  /** How evaluating the declaration uses the binding. */
  uses: ReadonlySet<ValueUse>
}

/** Record BF101 for each binding a body statement writes that a read evaluated after the write reaches. */
export function checkStatementWrites(ir: ComponentIR, errors: CompilerError[]): void {
  const resolve = localBindings({ ...ir.metadata, localConstants: ir.metadata.localConstants ?? [] })
  const writers = statementWriters(ir.metadata.initStatements ?? [], resolve)
  if (writers.size === 0) return
  const refused = new Set<string>()
  const eager = eagerDeclarations(ir.metadata)
  const others: Others = {
    holders: new Map(eager.map(d => [d.name, d.uses instanceof Map ? d.uses : opaqueUses(d.reads)])),
    functions: lazyReads(ir.metadata),
  }
  const check: Check = {
    ir,
    resolve,
    writers,
    eager,
    writtenReads: declaration => writtenReadsOf(declaration, writers, others, ir.metadata.propsObjectName ?? null),
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
    for (const { name, writer, after, uses } of writtenReads(declaration)) {
      if (after && computedTooEarly(writer, uses)) refuse(name, initReadError(name, declaration, writer.statement))
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
    for (const { name, writer, after, uses } of writtenReads(declaration)) {
      // Declared before the write, it holds what it took from the binding as
      // declared, as in JS, unless that may be the object a statement then
      // changes in place.
      if (after || mayHoldWrittenObject(declaration, writer, uses)) refuse(name, serverReadError(name, writer.statement))
    }
  }
}

/** Every eager use: the declaration computes something from the name where it stands. */
const EAGER_USES: readonly ValueUse[] = ['alias', 'copy', 'read', 'call', 'opaque']
/** The uses whose result does not follow a later in-place write: a value computed, or copied, from the object. */
const SNAPSHOT_USES: readonly ValueUse[] = ['copy', 'read', 'call', 'opaque']
/** The uses that may leave the declaration holding the object itself, or one it holds. */
const HOLDING_USES: readonly ValueUse[] = ['alias', 'opaque', 'deferred']

function hasAny(uses: ReadonlySet<ValueUse>, kinds: readonly ValueUse[]): boolean {
  return kinds.some(kind => uses.has(kind))
}

/**
 * In a client component, whether a declaration created before the statement
 * runs (init's order) differs from one created after it (JS's): it computed
 * something from a name the statement rebinds, or a snapshot of an object
 * the statement changes in place.
 */
function computedTooEarly(writer: Writer, uses: ReadonlySet<ValueUse>): boolean {
  if (writer.reassigned && hasAny(uses, EAGER_USES)) return true
  return writer.inPlace && hasAny(uses, SNAPSHOT_USES)
}

/**
 * Whether a declaration made before an in-place write may show that write
 * to a later reader: it holds the written object, a function that reads it,
 * or a shallow copy that shares the object written.
 */
function mayHoldWrittenObject(declaration: EagerDeclaration, writer: Writer, uses: ReadonlySet<ValueUse>): boolean {
  if (!writer.inPlace || declaration.type?.kind === 'primitive') return false
  return hasAny(uses, HOLDING_USES) || (writer.deep && uses.has('copy'))
}

function writtenReadsOf(
  declaration: EagerDeclaration,
  writers: ReadonlyMap<string, Writer>,
  others: Others,
  propsObject: string | null,
): WrittenRead[] {
  const found: WrittenRead[] = []
  const throughOthers = usesThroughOthers(declaration, others)
  for (const [name, writer] of writers) {
    const uses = new Set(usesOf(declaration, name))
    for (const use of throughOthers.get(name) ?? []) uses.add(use)
    if (uses.size === 0) continue
    // A member read is told apart only on the props object, and only when
    // the declaration's own expression is all that reads it.
    const members = name === propsObject && !throughOthers.has(name) ? membersRead(declaration.expr, name) : null
    if (overlaps(writer, members)) found.push({ name, writer, after: isAfter(declaration.loc, writer.statement.loc), uses })
  }
  return found
}

/** How evaluating `declaration` uses `name`: Phase 1's answer, or an opaque use of every name it mentions. */
function usesOf(declaration: EagerDeclaration, name: string): Iterable<ValueUse> {
  if (declaration.uses instanceof Map) return declaration.uses.get(name) ?? []
  return declaration.reads instanceof Set && declaration.reads.has(name) ? ['opaque'] : []
}

/** The component's other declarations a declaration can reach a written binding through. */
interface Others {
  /** The names each signal, memo and constant init evaluates in place uses, with how (`usesOf`). */
  holders: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<ValueUse>>>
  /** The names each of the component's functions reads, by the function's name. */
  functions: ReadonlyMap<string, ReadonlySet<string> | undefined>
}

/**
 * How a declaration reaches what another one holds, from its own use of
 * that one: it holds it (`alias`), keeps it in a function it does not call
 * (`deferred`), computes only a primitive from it or from what calling it
 * returns (`read`), or does anything else with it (`opaque`: a member read,
 * a spread, a call whose result it keeps may read or call whatever it holds).
 */
type Reach = 'alias' | 'deferred' | 'read' | 'opaque'

/**
 * What `declaration` does, through the other declarations it uses, with
 * the names they hold or read: what it uses ITSELF is `usesOf`'s, but a
 * name another declaration holds is used too when `declaration` uses that
 * one (`const box = { read: () => local.length }` then `box.read()`, or
 * `const alias = local` then `alias.length`), transitively. A signal, memo
 * or constant holds what its own value keeps of a name (an `alias`, a
 * `copy`, an `opaque` or a `deferred` use of it), not a primitive it
 * computed from it; a function reads every name it mentions when it runs.
 */
function usesThroughOthers(declaration: EagerDeclaration, others: Others): Map<string, Set<ValueUse>> {
  const found = new Map<string, Set<ValueUse>>()
  const record = (name: string, use: ValueUse): void => {
    const known = found.get(name) ?? new Set<ValueUse>()
    known.add(use)
    found.set(name, known)
  }
  const seen = new Set<string>()
  const pending: Array<[string, Reach]> = []
  const enter = (name: string, reach: Reach): void => {
    const key = `${reach} ${name}`
    if (name === declaration.name || seen.has(key)) return
    seen.add(key)
    pending.push([name, reach])
  }
  const own = declaration.uses instanceof Map ? declaration.uses : opaqueUses(declaration.reads)
  for (const [name, uses] of own) {
    for (const reach of reachesOf(uses, others.functions.has(name))) enter(name, reach)
  }
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [name, reach] = next
    for (const [inner, uses] of heldBy(name, reach, others)) {
      for (const use of uses) record(inner, use)
      for (const innerReach of reachesOf(uses, false)) enter(inner, innerReach)
    }
  }
  return found
}

function opaqueUses(reads: ReadonlySet<string> | undefined): Map<string, ReadonlySet<ValueUse>> {
  const uses = new Map<string, ReadonlySet<ValueUse>>()
  if (reads instanceof Set) for (const name of reads) uses.set(name, new Set<ValueUse>(['opaque']))
  return uses
}

/**
 * How a use of another declaration reaches into it. A function is reached
 * only when it is called, or may be (`opaque`), or held: reading it, or
 * coercing it, runs nothing of its own.
 */
function reachesOf(uses: ReadonlySet<ValueUse>, isFunction: boolean): Reach[] {
  const reaches: Reach[] = []
  if (uses.has('alias')) reaches.push('alias')
  if (uses.has('deferred')) reaches.push('deferred')
  if (uses.has('opaque') || uses.has('copy')) reaches.push('opaque')
  else if (uses.has('call') || (uses.has('read') && !isFunction)) reaches.push('read')
  return reaches
}

/** The names `name`, reached as `reach`, holds or reads, each with the use the reaching declaration then makes of it. */
function heldBy(name: string, reach: Reach, others: Others): Map<string, ReadonlySet<ValueUse>> {
  const held = new Map<string, ReadonlySet<ValueUse>>()
  const holder = others.holders.get(name)
  if (holder) {
    for (const [inner, uses] of holder) {
      const kept = [...uses].filter(use => HOLDING_USES.includes(use) || use === 'copy')
      if (kept.length === 0) continue
      // Held, it is held as the holder holds it; anything else done to the holder is done to what it keeps.
      held.set(inner, new Set<ValueUse>(reach === 'alias' ? kept : [reach]))
    }
  }
  const reads = others.functions.get(name)
  if (reads instanceof Set) {
    // A function held is a function kept uncalled; one called reads all it mentions.
    const use: ValueUse = reach === 'alias' || reach === 'deferred' ? 'deferred' : reach
    for (const inner of reads) held.set(inner, new Set<ValueUse>([use]))
  }
  return held
}

/**
 * What the body's statements write to each binding the component or its
 * module declares: a constant (`const` or `let`), a prop, the props object.
 * Signals, memos and functions hold no value a statement's write changes for
 * a reader.
 */
function statementWriters(statements: readonly InitStatementInfo[], resolve: LocalBindingResolver): Map<string, Writer> {
  const writers = new Map<string, Writer>()
  const record = (name: string, statement: InitStatementInfo, write: Omit<Writer, 'statement'>): void => {
    const kind = resolve(name, 'component')?.kind
    if (kind !== 'const' && kind !== 'opaque') return
    const known = writers.get(name)
    if (!known) {
      writers.set(name, { statement, ...write, members: write.members && new Set(write.members) })
      return
    }
    known.inPlace ||= write.inPlace
    known.reassigned ||= write.reassigned
    known.deep ||= write.deep
    if (write.members === null || known.members === null) known.members = null
    else for (const member of write.members) known.members.add(member)
  }
  for (const statement of statements) {
    // An IR that went through JSON holds no `Set` / `Map`: nothing to read there.
    if (statement.assignedIdentifiers instanceof Set) {
      for (const name of statement.assignedIdentifiers) record(name, statement, { members: null, inPlace: false, reassigned: true, deep: false })
    }
    if (statement.mutatedIdentifiers instanceof Set) {
      const members = statement.mutatedMembers instanceof Map ? statement.mutatedMembers : undefined
      // Without the fact, an in-place write may be to an object the binding holds.
      const deep = statement.deeplyMutatedIdentifiers instanceof Set ? statement.deeplyMutatedIdentifiers : undefined
      for (const name of statement.mutatedIdentifiers) {
        record(name, statement, { members: members?.get(name) ?? null, inPlace: true, reassigned: false, deep: deep?.has(name) ?? true })
      }
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
    declarations.push({ name: c.name, subject: `'${c.name}'`, loc: c.loc, reads: c.freeIdentifiers, uses: c.valueUses, expr: c.parsed, type: c.type })
  }
  for (const s of metadata.signals) {
    if (s.isModule || s.envReader) continue
    declarations.push({ name: s.getter, subject: `Signal '${s.getter}'`, loc: s.loc, reads: s.initialFreeIdentifiers, uses: s.valueUses, expr: s.parsed, type: s.type })
  }
  for (const m of metadata.memos) {
    if (m.isModule) continue
    declarations.push({ name: m.name, subject: `Memo '${m.name}'`, loc: m.loc, reads: m.computationFreeIdentifiers, uses: m.valueUses, expr: m.parsed, type: m.type })
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
