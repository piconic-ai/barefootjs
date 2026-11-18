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
 * A module const the replica can declare: a plain value the component never
 * reassigns. One the component only mutates (`box.n = 2`) is declared there
 * too: the component reads the same object through `<replica>.<name>`, so
 * its writes and the replica's reads share one storage.
 */
function replicaCanDeclare(c: ConstantInfo): boolean {
  return c.value !== undefined && c.value !== ''
    && !c.isJsx && !c.isJsxFunction && !c.systemConstructKind
    && !c.reassigned
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
 * The module declarations whose evaluation depends on a name the component
 * binds, closed over what they read: each member of the result must be
 * evaluated in module scope, together.
 */
function scopeSensitiveClosure(
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  moduleFunctions: ReadonlyMap<string, FunctionInfo>,
  componentNames: ReadonlySet<string>,
): Set<string> {
  const freeOf = (name: string): ReadonlySet<string> => {
    const c = moduleConstants.get(name)
    if (c) return freeIdentifiersOfConstant(c)
    return moduleFunctions.get(name)?.freeIdentifiers ?? new Set()
  }
  const closure = new Set<string>()
  const pending: string[] = []
  // Seeds: a module declaration the component can read (its name is not
  // hidden) that itself reads a name the component binds.
  for (const [name, c] of moduleConstants) {
    if (componentNames.has(name)) continue
    if (replicaCanDeclare(c) && intersects(freeIdentifiersOfConstant(c), componentNames)) pending.push(name)
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
  return dropUndeclarableMembers(closure, moduleConstants, freeOf)
}

/**
 * Remove from `closure` every member that reads, directly or through another
 * member, a module const the replica cannot declare (one the component
 * reassigns, `replicaCanDeclare`). A reassigned binding has one storage per
 * scope, so it must stay where the component writes it; a replica member
 * reading it would find no binding. The removed member stays in the
 * component's view, where it is emitted next to the const it reads. (A
 * removed member that also reads a name the component hides resolves that
 * name to the component's binding: a known gap.)
 */
function dropUndeclarableMembers(
  closure: Set<string>,
  moduleConstants: ReadonlyMap<string, ConstantInfo>,
  freeOf: (name: string) => ReadonlySet<string>,
): Set<string> {
  const blocked = (name: string): boolean => {
    const c = moduleConstants.get(name)
    return c !== undefined && !replicaCanDeclare(c)
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

  const closure = scopeSensitiveClosure(moduleConstants, moduleFunctions, componentNames)
  const constants = [...moduleConstants.values()].filter(c => closure.has(c.name) && replicaCanDeclare(c))
  const declaredConstants = new Set(constants.map(c => c.name))
  const functions = [...moduleFunctions.values()].filter(f => closure.has(f.name) && !declaredConstants.has(f.name))
  if (constants.length === 0 && functions.length === 0) return unchanged

  const taken = new Set<string>([...componentNames, ...moduleConstants.keys(), ...metadata.localFunctions.map(f => f.name)])
  for (const c of constants) for (const id of freeIdentifiersOfConstant(c)) taken.add(id)
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
    replica: { name, constants, functions, exported },
  }
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
 * component never reads is not shipped to the client.
 */
export function usedReplicaDeclarations(
  replica: ModuleScopeReplica,
  used: ReadonlySet<string>,
): Pick<ModuleScopeReplica, 'constants' | 'functions' | 'exported'> | null {
  const exported = replica.exported.filter(name => used.has(name))
  if (exported.length === 0) return null
  const constants = new Map(replica.constants.map(c => [c.name, c]))
  const functions = new Map(replica.functions.map(f => [f.name, f]))
  const needed = new Set<string>()
  const pending = [...exported]
  while (pending.length > 0) {
    const name = pending.pop()!
    if (needed.has(name)) continue
    needed.add(name)
    const c = constants.get(name)
    const reads = c ? freeIdentifiersOfConstant(c) : functions.get(name)?.freeIdentifiers ?? new Set<string>()
    for (const read of reads) {
      if (!needed.has(read) && (constants.has(read) || functions.has(read))) pending.push(read)
    }
  }
  return {
    constants: replica.constants.filter(c => needed.has(c.name)),
    functions: replica.functions.filter(f => needed.has(f.name)),
    exported,
  }
}
