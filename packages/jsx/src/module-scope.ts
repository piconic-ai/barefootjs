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
 * (`ModuleScopeReplica.shared`, #3932). For the same reason, a shared `let`
 * whose initializer reads another module const or function is evaluated in
 * the replica even when the component hides no name: at client-module level
 * the consts it reads are not declared, since the script copies them into the
 * init body (#3968).
 */

import type { ConstantInfo, FunctionInfo, IRMetadata } from './types.ts'
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
   * whose initializer reads a name the component binds or another module
   * declaration. The replica evaluates
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
>

/**
 * What `replicaRole` reads besides the const: the names the component binds,
 * and the module consts a module function assigns (`FunctionInfo.assignedIdentifiers`).
 */
interface RoleEnv {
  componentNames: ReadonlySet<string>
  writtenByFunction: ReadonlySet<string>
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

/**
 * Must the module const `c` (one the component does not hide) be evaluated in
 * the replica? When it reads a name the component binds, or when it is a
 * shared binding whose initializer reads another module const or function: a
 * shared binding's storage is a client-module variable, so its initializer
 * would run at client-module level, where a module declaration copied into the
 * init body is not declared (#3968).
 */
function seedsClosure(
  c: ConstantInfo,
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  moduleFunctions: ReadonlyMap<string, FunctionInfo>,
  env: RoleEnv,
): boolean {
  const role = replicaRole(c, env)
  if (role === 'blocked') return false
  const reads = freeIdentifiersOfConstant(c)
  if (intersects(reads, env.componentNames)) return true
  if (role !== 'shared') return false
  for (const read of reads) {
    if (read !== c.name && (moduleConstants.has(read) || moduleFunctions.has(read))) return true
  }
  return false
}

/**
 * The module declarations whose evaluation depends on a name the component
 * binds, or that a shared binding's initializer reads, closed over what they
 * read: each member of the result must be evaluated in module scope, together.
 */
function scopeSensitiveClosure(
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  moduleFunctions: ReadonlyMap<string, FunctionInfo>,
  env: RoleEnv,
): Set<string> {
  const { componentNames } = env
  const freeOf = (name: string): ReadonlySet<string> => {
    const c = moduleConstants.get(name)
    if (c) return freeIdentifiersOfConstant(c)
    return moduleFunctions.get(name)?.freeIdentifiers ?? new Set()
  }
  const closure = new Set<string>()
  const pending: string[] = []
  // Seeds: a module declaration the component can read (its name is not
  // hidden) that itself reads a name the component binds, or a shared binding
  // whose initializer reads another module declaration.
  for (const [name, c] of moduleConstants) {
    if (!componentNames.has(name) && seedsClosure(c, moduleConstants, moduleFunctions, env)) pending.push(name)
  }
  for (const [name, f] of moduleFunctions) {
    if (componentNames.has(name)) continue
    if (intersects(f.freeIdentifiers ?? new Set(), componentNames)) pending.push(name)
  }
  while (pending.length > 0) {
    const name = pending.pop()!
    if (closure.has(name)) continue
    closure.add(name)
    for (const read of freeOf(name)) {
      if (!closure.has(read) && (moduleConstants.has(read) || moduleFunctions.has(read))) pending.push(read)
    }
  }
  addReadersOfSharedStorage(closure, moduleConstants, env)
  return dropUndeclarableMembers(closure, moduleConstants, freeOf, env)
}

/**
 * A module const evaluates in source order, so one that reads a shared binding
 * (directly or through another such const) must run in the replica, after the
 * shared initializers before it: at module level it would run before the
 * replica gave the binding its value. Add each such const, with what it reads,
 * once the closure holds a shared binding.
 */
function addReadersOfSharedStorage(
  closure: Set<string>,
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  env: RoleEnv,
): void {
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
  // What the added consts read joins the closure too.
  const pending = [...closure]
  while (pending.length > 0) {
    const c = moduleConstants.get(pending.pop()!)
    if (!c) continue
    for (const read of freeIdentifiersOfConstant(c)) {
      if (moduleConstants.has(read) && !closure.has(read)) {
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

  const env: RoleEnv = { componentNames, writtenByFunction: namesWrittenByModuleFunctions(metadata.localFunctions) }
  const closure = scopeSensitiveClosure(moduleConstants, moduleFunctions, env)
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
