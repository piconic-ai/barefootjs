/**
 * Lexical module scope of a component file (#3739).
 *
 * A module-scope declaration reads module bindings, imports and globals. A
 * component binding of the same name (a prop, a const, a signal, a memo, a
 * function) hides it inside the component only. Both JS emitters used to
 * place module declarations by NAME into the component's scope, which made a
 * module const read the component's binding and a component const collide
 * with a module one. The decisions here answer by DECLARATION:
 *
 * - `isModuleLexicalConstant` / `isModuleLexicalFunction`: is this
 *   declaration lexically at module scope? The Hono template keeps exactly
 *   those at module scope.
 * - `moduleScopeView`: what the client script's component scope sees. The
 *   client script has no real module scope to give a component (children are
 *   inlined into their parent's file, so module-level names of two files
 *   would meet); it copies the module consts a component reads into the init
 *   body. A copy evaluates in the component's scope, so a module const whose
 *   evaluation depends on a name the component binds cannot be copied: those
 *   are evaluated once in a per-component replica of the module scope, and
 *   the component reads the replica's member.
 * - `usedReplicaDeclarations`: the part of that replica a component's script
 *   declares, given the members it reads.
 *
 * A module `let` the component reassigns has one storage, which the component
 * writes at client-module level (`var counter = counter ?? 0`). A replica
 * member that reads it (`function g() { return base + counter }`, with `base`
 * hidden by a prop) reads that same variable, so the replica never declares
 * it; it only evaluates the initializer, where the module's own names are
 * visible, and hands the value to the module-level declaration
 * (`ModuleScopeReplica.shared`, #3932). For the same reason, a module `let`
 * a top-level statement of the component reassigns, whose initializer reads
 * another module const or function, is evaluated in the replica even when the
 * component hides no name: its storage is at client-module level, where the
 * consts it reads are not declared, since the script copies them into the init
 * body (#3968). One only a handler or a module function writes stays a
 * per-instance copy in the init body, so two inlined files' bindings of the
 * same name do not meet. That widening is all or nothing
 * (`scopeSensitiveClosure`): unless the replica can host everything it would
 * take in, the replica is the one the hidden names alone call for.
 */

import type { ConstantInfo, FunctionInfo, InitStatementInfo, IRMetadata, MemoInfo, SignalInfo } from './types.ts'
import { componentScopeNames } from './adapters/computed-const.ts'
import { extractFreeIdentifiersFromText } from './ir-to-client-js/csr-substitute.ts'

/** A const (or `let`) declared outside the component function. */
export function isModuleLexicalConstant(c: Pick<ConstantInfo, 'isModule'>): boolean {
  return c.isModule === true
}

/**
 * A `function` declared outside the component function. One declared inside
 * the component body carries `isModule` too (`FunctionInfo.inComponentBody`).
 */
export function isModuleLexicalFunction(f: Pick<FunctionInfo, 'isModule' | 'inComponentBody'>): boolean {
  return f.isModule === true && !f.inComponentBody
}

/** The module-scope replica of one component's client script. */
export interface ModuleScopeReplica {
  /** The client-script module-level name holding the replica's members. */
  name: string
  /** Module consts declared in the replica, in source order. */
  constants: ConstantInfo[]
  /** Module functions declared in the replica. */
  functions: FunctionInfo[]
  /** Names of the replica's declarations the component can read (not hidden). */
  exported: string[]
  /**
   * Module consts the component reassigns that the replica's members read, or
   * whose initializer reads a name the component binds (or, for one a
   * top-level statement reassigns, another module declaration). The replica evaluates
   * their initializers and returns each value under its own name; the client
   * script declares the variable at module level and the replica assigns it
   * in source order, among the consts (`emitModuleScopeReplica`).
   */
  shared: ConstantInfo[]
  /** Names of `constants` and `shared`, in source order. */
  sourceOrder: string[]
}

export interface ModuleScopeView {
  /**
   * The constants the component's scope sees: the component's own, and each
   * module const it does not hide. A replica member (a const, or a function
   * the replica declares) reads `<replica>.<name>`; the others are unchanged.
   */
  localConstants: ConstantInfo[]
  /**
   * The functions the component's scope sees: the component's own, and each
   * module function it does not hide and the replica does not declare.
   */
  localFunctions: FunctionInfo[]
  /** The replica, or `null` when no module declaration needs one. */
  replica: ModuleScopeReplica | null
}

type ViewMetadata = Pick<
  IRMetadata,
  'propsObjectName' | 'propsParams' | 'restPropsName' | 'localConstants' | 'localFunctions' | 'signals' | 'memos'
> & Partial<Pick<IRMetadata, 'initStatements'>>

/**
 * What `replicaRole` reads besides the const: the names the component binds,
 * and the module consts a module function assigns (`FunctionInfo.assignedIdentifiers`).
 * `writtenByStatement` holds the names a top-level statement of the component
 * body reassigns (`InitStatementInfo.assignedIdentifiers`): the client script
 * gives such a module `let` its storage at client-module level in any case.
 */
interface RoleEnv {
  componentNames: ReadonlySet<string>
  writtenByFunction: ReadonlySet<string>
  writtenByStatement: ReadonlySet<string>
}

/** How the replica treats a module const that a replica member reads. */
type ReplicaRole = 'declared' | 'shared' | 'blocked'

/**
 * - `declared`: a plain value the component never reassigns, evaluated in the
 *   replica. One the component only mutates (`box.n = 2`) is declared there
 *   too: the component reads the same object through `<replica>.<name>`, so
 *   its writes and the replica's reads share one storage.
 * - `shared`: a binding the component or a module function reassigns (and the
 *   component does not hide: a hidden one is written only as the component's own binding). The storage stays
 *   at client-module level, where the component writes it (#3932).
 * - `blocked`: a value the replica has nothing to evaluate (JSX, a system
 *   construct, a bare `let` nobody writes).
 */
function replicaRole(c: ConstantInfo, env: RoleEnv): ReplicaRole {
  if (c.isJsx || c.isJsxFunction || c.systemConstructKind) return 'blocked'
  if ((c.reassigned || env.writtenByFunction.has(c.name)) && !env.componentNames.has(c.name)) return 'shared'
  return c.value !== undefined && c.value !== '' ? 'declared' : 'blocked'
}

function freeIdentifiersOfConstant(c: ConstantInfo): ReadonlySet<string> {
  return c.freeIdentifiers ?? extractFreeIdentifiersFromText(c.value ?? '')
}

function intersects(names: ReadonlySet<string>, other: ReadonlySet<string>): boolean {
  for (const name of names) if (other.has(name)) return true
  return false
}

/** `base`, lengthened until no name of the file's scopes is spelled the same. */
function untakenName(base: string, taken: ReadonlySet<string>): string {
  let name = base
  while (taken.has(name)) name += '_'
  return name
}

/** A module function the replica can declare (a JSX helper is inlined at its call sites instead). */
function replicaCanDeclareFunction(f: FunctionInfo): boolean {
  return !f.isJsxFunction && !f.isMultiReturnJsxHelper && !f.containsJsx
}

/** The module consts and functions the replica may declare, and what each reads. */
interface ModuleDeclarations {
  constants: ReadonlyMap<string, ConstantInfo>
  functions: ReadonlyMap<string, FunctionInfo>
  /** Module functions the replica cannot declare (JSX helpers). */
  undeclarableFunctions: ReadonlySet<string>
  freeOf: (name: string) => ReadonlySet<string>
  /** What each module-level signal's and memo's initializer reads. */
  reactiveReads: readonly ReadonlySet<string>[]
}

/**
 * A signal or memo declared at module scope (`/* @client *​/`). The client
 * script emits it at client-module level, ahead of the module-scope replica
 * (`init-declarations.ts` routes by this predicate).
 */
export function isModuleLevelReactive(d: Pick<SignalInfo | MemoInfo, 'isModule'>): boolean {
  return d.isModule === true
}

/** The names each module-level signal's and memo's initializer reads. */
function moduleLevelReactiveReads(metadata: Pick<IRMetadata, 'signals' | 'memos'>): ReadonlySet<string>[] {
  const reads: ReadonlySet<string>[] = []
  for (const s of metadata.signals) {
    if (isModuleLevelReactive(s)) reads.push(s.initialFreeIdentifiers ?? extractFreeIdentifiersFromText(s.initialValue))
  }
  for (const m of metadata.memos) {
    if (isModuleLevelReactive(m)) reads.push(m.computationFreeIdentifiers ?? extractFreeIdentifiersFromText(m.computation))
  }
  return reads
}

/**
 * The seeds every replica has had (#3739, #3932): a module declaration the
 * component can read (its name is not hidden) that itself reads a name the
 * component binds.
 */
function hiddenNameSeeds(decls: ModuleDeclarations, env: RoleEnv): string[] {
  const { componentNames } = env
  const seeds: string[] = []
  for (const [name, c] of decls.constants) {
    if (componentNames.has(name) || replicaRole(c, env) === 'blocked') continue
    if (intersects(freeIdentifiersOfConstant(c), componentNames)) seeds.push(name)
  }
  for (const [name, f] of decls.functions) {
    if (componentNames.has(name)) continue
    if (intersects(f.freeIdentifiers ?? new Set(), componentNames)) seeds.push(name)
  }
  return seeds
}

/**
 * The seeds #3968 adds: a shared module `let` a top-level statement of the
 * component reassigns (so its storage is at client-module level already)
 * whose initializer reads another module const or function. At client-module
 * level those are not declared: the script copies them into the init body.
 * One a handler or a module function alone writes stays a per-instance copy
 * in the init body, where what it reads is declared too.
 */
function moduleReadSeeds(decls: ModuleDeclarations, env: RoleEnv): string[] {
  const seeds: string[] = []
  for (const [name, c] of decls.constants) {
    if (env.componentNames.has(name) || !env.writtenByStatement.has(name)) continue
    if (replicaRole(c, env) !== 'shared') continue
    const reads = [...freeIdentifiersOfConstant(c)].filter(r => r !== name)
    if (reads.some(r => decls.constants.has(r) || decls.functions.has(r))) seeds.push(name)
  }
  return seeds
}

/** Add to `closure` what its members read: module consts, and module functions. */
function closeOverReads(closure: Set<string>, pending: string[], decls: ModuleDeclarations): void {
  while (pending.length > 0) {
    const name = pending.pop()!
    if (closure.has(name)) continue
    closure.add(name)
    for (const read of decls.freeOf(name)) {
      if (!closure.has(read) && (decls.constants.has(read) || decls.functions.has(read))) pending.push(read)
    }
  }
}

/**
 * The module declarations whose evaluation depends on a name the component
 * binds, closed over what they read: each member of the result must be
 * evaluated in module scope, together.
 *
 * #3968 widens this, all or nothing: with the shared `let`s that read a module
 * declaration as further seeds, and module functions followed for the consts
 * that read shared storage, the wider closure is taken only when the replica
 * can host every member of it and no initializer outside it reads one of its
 * bindings. Otherwise the result is exactly the narrower closure.
 */
function scopeSensitiveClosure(decls: ModuleDeclarations, env: RoleEnv): Set<string> {
  const seeds = hiddenNameSeeds(decls, env)
  const narrow = new Set<string>()
  closeOverReads(narrow, [...seeds], decls)
  addReadersOfSharedStorage(narrow, decls, env, false)
  const wide = new Set<string>()
  closeOverReads(wide, [...seeds, ...moduleReadSeeds(decls, env)], decls)
  addReadersOfSharedStorage(wide, decls, env, true)
  const widened = [...wide].some(n => !narrow.has(n))
  if (widened && replicaHostsAll(wide, decls, env) && noOutsideInitializerReads(wide, decls, env)) return wide
  return dropUndeclarableMembers(narrow, decls.constants, decls.freeOf, env)
}

/**
 * Can the replica evaluate every member of `closure` on its own? Each const
 * must be one it declares or assigns, and nothing may read a module function
 * it cannot declare.
 */
function replicaHostsAll(closure: ReadonlySet<string>, decls: ModuleDeclarations, env: RoleEnv): boolean {
  for (const name of closure) {
    const c = decls.constants.get(name)
    if (c && replicaRole(c, env) === 'blocked') return false
    if (intersects(decls.freeOf(name), decls.undeclarableFunctions)) return false
  }
  return true
}

/**
 * Does an initializer the client script evaluates at client-module level,
 * ahead of the replica, read a member of `closure` (directly, or through a
 * module function or const outside it that it calls or reads)? It would read
 * the binding before the replica gave it its value. Those initializers are
 * every module-level signal and memo (`isModuleLevelReactive`, the predicate
 * the emitter routes them by) and every module const outside `closure` that
 * is not a plain value: a shared binding or a system construct. A plain const
 * outside is copied into the init body, which runs after the replica (one that
 * reads a shared member is in `closure` already, `addReadersOfSharedStorage`).
 */
function noOutsideInitializerReads(closure: ReadonlySet<string>, decls: ModuleDeclarations, env: RoleEnv): boolean {
  const roots: ReadonlySet<string>[] = [...decls.reactiveReads]
  for (const [name, c] of decls.constants) {
    if (!closure.has(name) && replicaRole(c, env) !== 'declared') roots.push(freeIdentifiersOfConstant(c))
  }
  const seen = new Set<string>()
  const pending = roots.flatMap(r => [...r])
  while (pending.length > 0) {
    const name = pending.pop()!
    if (closure.has(name)) return false
    if (seen.has(name)) continue
    seen.add(name)
    if (decls.constants.has(name) || decls.functions.has(name)) pending.push(...decls.freeOf(name))
  }
  return true
}

/**
 * A module const evaluates in source order, so one that reads a shared binding
 * (directly or through another such const) must run in the replica, after the
 * shared initializers before it: at module level it would run before the
 * replica gave the binding its value. Add each such const, with what it reads,
 * once the closure holds a shared binding. `followFunctions` also adds the
 * module functions those consts read (#3968).
 */
function addReadersOfSharedStorage(
  closure: Set<string>,
  decls: ModuleDeclarations,
  env: RoleEnv,
  followFunctions: boolean,
): void {
  const moduleConstants = decls.constants
  const tainted = new Set([...closure].filter(n => {
    const c = moduleConstants.get(n)
    return c !== undefined && replicaRole(c, env) === 'shared'
  }))
  if (tainted.size === 0) return
  let changed = true
  while (changed) {
    changed = false
    for (const [name, c] of moduleConstants) {
      if (tainted.has(name) || env.componentNames.has(name) || replicaRole(c, env) !== 'declared') continue
      if (!intersects(freeIdentifiersOfConstant(c), tainted)) continue
      tainted.add(name)
      closure.add(name)
      changed = true
    }
  }
  addReadsOfMembers(closure, decls, followFunctions)
}

/**
 * Add what the members of `closure` read: the module consts they read and,
 * with `followFunctions`, the module functions too and what those read.
 */
function addReadsOfMembers(closure: Set<string>, decls: ModuleDeclarations, followFunctions: boolean): void {
  const follows = (name: string): boolean => decls.constants.has(name) || (followFunctions && decls.functions.has(name))
  const pending = [...closure]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (!decls.constants.has(name) && !followFunctions) continue
    for (const read of decls.freeOf(name)) {
      if (follows(read) && !closure.has(read)) {
        closure.add(read)
        pending.push(read)
      }
    }
  }
}

/**
 * Remove from `closure` every member that reads, directly or through another
 * member, a module const the replica has no value for (`blocked`: JSX, a
 * system construct, a bare `let` nobody writes). The removed member stays in
 * the component's view, where it is emitted next to the const it reads. (A
 * removed member that also reads a name the component hides resolves that
 * name to the component's binding: a known gap.)
 */
function dropUndeclarableMembers(
  closure: Set<string>,
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  freeOf: (name: string) => ReadonlySet<string>,
  env: RoleEnv,
): Set<string> {
  const blocked = (name: string): boolean => {
    const c = moduleConstants.get(name)
    return c !== undefined && replicaRole(c, env) === 'blocked'
  }
  const dropped = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const name of [...closure]) {
      if (blocked(name)) continue
      if ([...freeOf(name)].some(r => blocked(r) || dropped.has(r))) {
        closure.delete(name)
        dropped.add(name)
        changed = true
      }
    }
  }
  return closure
}

/**
 * The component-scope view of the file's constants and functions for the
 * client script, and the module-scope replica that view reads (see the file
 * header).
 *
 * - A module const or function the component hides (a component binding has
 *   its name) is not in the view: no read in the component reaches it.
 * - A module const or function that reads a name the component binds, and
 *   every module const and function it reads in turn, is declared in the
 *   replica. The view's entry for such a declaration is a const reading the
 *   replica's member.
 * - Every other module declaration is in the view unchanged: its copy in the
 *   client script evaluates to what the module evaluates.
 *
 * `replicaBaseName` is the replica's module-level name in the client script.
 * It must be unique to the component across every file a bundle inlines
 * together, so the caller derives it from the component's registry key.
 */
export function moduleScopeView(metadata: ViewMetadata, replicaBaseName: string): ModuleScopeView {
  const componentNames = componentScopeNames(metadata)
  const moduleConstants = new Map<string, ConstantInfo>()
  for (const c of metadata.localConstants) {
    if (isModuleLexicalConstant(c) && !moduleConstants.has(c.name)) moduleConstants.set(c.name, c)
  }
  const moduleFunctions = new Map<string, FunctionInfo>()
  for (const f of metadata.localFunctions) {
    if (isModuleLexicalFunction(f) && replicaCanDeclareFunction(f) && !moduleFunctions.has(f.name)) {
      moduleFunctions.set(f.name, f)
    }
  }
  const visibleConstants = metadata.localConstants.filter(c => !(isModuleLexicalConstant(c) && componentNames.has(c.name)))
  const visibleFunctions = metadata.localFunctions.filter(f => !(isModuleLexicalFunction(f) && componentNames.has(f.name)))
  const unchanged = { localConstants: visibleConstants, localFunctions: visibleFunctions, replica: null }
  if (moduleConstants.size === 0 && moduleFunctions.size === 0) return unchanged

  const env: RoleEnv = {
    componentNames,
    writtenByFunction: namesWrittenByModuleFunctions(metadata.localFunctions),
    writtenByStatement: namesWrittenByStatements(metadata.initStatements ?? []),
  }
  const undeclarableFunctions = new Set(
    metadata.localFunctions.filter(f => isModuleLexicalFunction(f) && !replicaCanDeclareFunction(f)).map(f => f.name),
  )
  const freeOf = (name: string): ReadonlySet<string> => {
    const c = moduleConstants.get(name)
    if (c) return freeIdentifiersOfConstant(c)
    return moduleFunctions.get(name)?.freeIdentifiers ?? new Set()
  }
  const decls: ModuleDeclarations = {
    constants: moduleConstants,
    functions: moduleFunctions,
    undeclarableFunctions,
    freeOf,
    reactiveReads: moduleLevelReactiveReads(metadata),
  }
  const closure = scopeSensitiveClosure(decls, env)
  const inClosure = [...moduleConstants.values()].filter(c => closure.has(c.name))
  const constants = inClosure.filter(c => replicaRole(c, env) === 'declared')
  const shared = inClosure.filter(c => replicaRole(c, env) === 'shared')
  const declaredConstants = new Set(constants.map(c => c.name))
  const functions = [...moduleFunctions.values()].filter(f => closure.has(f.name) && !declaredConstants.has(f.name))
  if (constants.length === 0 && functions.length === 0 && shared.length === 0) return unchanged

  const taken = new Set<string>([...componentNames, ...moduleConstants.keys(), ...metadata.localFunctions.map(f => f.name)])
  for (const c of [...constants, ...shared]) for (const id of freeIdentifiersOfConstant(c)) taken.add(id)
  for (const f of functions) for (const id of f.freeIdentifiers ?? []) taken.add(id)
  const name = untakenName(replicaBaseName, taken)
  const exported = [...constants, ...functions].filter(d => !componentNames.has(d.name)).map(d => d.name)
  const exportedNames = new Set(exported)
  return {
    localConstants: [
      ...visibleConstants.map(c =>
        isModuleLexicalConstant(c) && exportedNames.has(c.name) ? replicaMemberRead(c, name) : c,
      ),
      ...functions.filter(f => exportedNames.has(f.name)).map(f => replicaMemberRead(f, name)),
    ],
    localFunctions: visibleFunctions.filter(f => !(isModuleLexicalFunction(f) && exportedNames.has(f.name))),
    replica: { name, constants, functions, exported, shared, sourceOrder: inClosure.map(c => c.name) },
  }
}

/** The names the component body's top-level statements reassign. */
function namesWrittenByStatements(statements: readonly InitStatementInfo[]): Set<string> {
  const written = new Set<string>()
  for (const stmt of statements) for (const id of stmt.assignedIdentifiers ?? []) written.add(id)
  return written
}

/** The names the module-level functions assign. */
function namesWrittenByModuleFunctions(functions: readonly FunctionInfo[]): Set<string> {
  const written = new Set<string>()
  for (const f of functions) {
    if (isModuleLexicalFunction(f)) for (const id of f.assignedIdentifiers ?? []) written.add(id)
  }
  return written
}

/** The view's entry for a replica member: a const reading `<replica>.<name>`. */
function replicaMemberRead(d: ConstantInfo | FunctionInfo, replica: string): ConstantInfo {
  return {
    name: d.name,
    value: `${replica}.${d.name}`,
    declarationKind: 'const',
    isModule: true,
    isExported: d.isExported,
    type: null,
    loc: d.loc,
    freeIdentifiers: new Set([replica]),
    origin: { phase: 'compile', scope: 'module', effect: 'pure' },
  }
}

/**
 * The declarations of `replica` the client script emits when the component
 * reads the members named in `used`: those members and what they read in
 * turn, in source order. `null` when it reads none, so a module const the
 * component never reads is not shipped to the client. A shared const (see
 * `ModuleScopeReplica.shared`) the component or a needed member reads is
 * needed too, with what its initializer reads.
 */
export function usedReplicaDeclarations(
  replica: ModuleScopeReplica,
  used: ReadonlySet<string>,
): Pick<ModuleScopeReplica, 'constants' | 'functions' | 'exported' | 'shared' | 'sourceOrder'> | null {
  const exported = replica.exported.filter(name => used.has(name))
  const sharedRoots = replica.shared.filter(c => used.has(c.name)).map(c => c.name)
  if (exported.length === 0 && sharedRoots.length === 0) return null
  const constants = new Map(replica.constants.map(c => [c.name, c]))
  const functions = new Map(replica.functions.map(f => [f.name, f]))
  const shared = new Map(replica.shared.map(c => [c.name, c]))
  const needed = new Set<string>()
  const pending = [...exported, ...sharedRoots]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (needed.has(name)) continue
    needed.add(name)
    const c = constants.get(name) ?? shared.get(name)
    const reads = c ? freeIdentifiersOfConstant(c) : functions.get(name)?.freeIdentifiers ?? new Set<string>()
    for (const read of reads) {
      if (!needed.has(read) && (constants.has(read) || functions.has(read) || shared.has(read))) pending.push(read)
    }
  }
  return {
    constants: replica.constants.filter(c => needed.has(c.name)),
    functions: replica.functions.filter(f => needed.has(f.name)),
    exported,
    shared: replica.shared.filter(c => needed.has(c.name)),
    sourceOrder: replica.sourceOrder.filter(name => needed.has(name)),
  }
}

/**
 * The names of the shared consts the client script's replica evaluates: the
 * module-level declaration of each comes from the replica, not from its own
 * initializer.
 */
export function sharedStorageNames(replica: ModuleScopeReplica | null, used: ReadonlySet<string>): ReadonlySet<string> {
  const emitted = replica ? usedReplicaDeclarations(replica, used) : null
  return new Set(emitted?.shared.map(c => c.name))
}
