/**
 * Declaration scope classifier.
 *
 * Pure function of `ClientJsContext` + `ReferencesGraph`. Returns the
 * emission scope (`module` | `init` | `skip`) for every local constant
 * and every local function, replacing the ad-hoc cascade that used to
 * live inline in `generate-init.ts`.
 *
 * Stage C of issue #1021 — analysis-on-IR refactor. See
 * `spec/compiler-analysis-ir.md` §"Target IR shape" for the routing
 * table and §"Invariants after Stages B–C–D" #2 for the guarantee this
 * function underwrites.
 */

import type {
  ConstantInfo,
  DeclarationScope,
  FunctionInfo,
  ReferencesGraph,
} from '../types'
import type { ClientJsContext } from './types'
import {
  graphAssignedIdentifiers,
  graphFunctionReferences,
  graphUsedIdentifiers,
} from './build-references'

export interface DeclarationScopes {
  constantScope: Map<string, DeclarationScope>
  functionScope: Map<string, DeclarationScope>
}

export function computeDeclarationScopes(
  ctx: ClientJsContext,
  graph: ReferencesGraph,
): DeclarationScopes {
  const constantScope = new Map<string, DeclarationScope>()
  const functionScope = new Map<string, DeclarationScope>()

  const usedIdentifiers = graphUsedIdentifiers(graph)
  const initStmtAssigned = graphAssignedIdentifiers(graph)

  // ============================================================================
  // Constants
  //
  // Cascade order mirrors generate-init.ts L114-151 (pre-Stage C):
  //
  //   1. isJsx / isJsxFunction           → skip  (inlined at IR level / call site)
  //   2. unused (not in graph)           → skip  — except provider context
  //                                                constants, which must ship
  //                                                even when nothing else reads
  //                                                them locally
  //   3. no value (bare `let x`)         → init  (emitted as `let X` placeholder)
  //   4. systemConstructKind             → module (unique identity)
  //   5. isModule + assignment target    → module (#933 ReferenceError avoidance)
  //   6. otherwise                       → init
  // ============================================================================

  const providerContextNames = new Set<string>()
  for (const p of ctx.providerSetups) providerContextNames.add(p.contextName)

  for (const c of ctx.localConstants) {
    constantScope.set(c.name, classifyConstant(c, usedIdentifiers, initStmtAssigned, providerContextNames))
  }

  // ============================================================================
  // Functions — forward-reachability fixpoint
  //
  // Seed `initRequired` with anything that must live inside the init
  // function (reactive roots, props, and every constant classified as
  // `init` above). Then walk every module-level candidate: if its body
  // references any name in the set, demote it to init scope and add its
  // own name so transitive callers demote in the next iteration. Loop
  // until stable. Functions that survive the fixpoint are `module`.
  // Mirrors generate-init.ts L218-280 (pre-Stage C).
  // ============================================================================

  const initRequired = new Set<string>()
  for (const s of ctx.signals) {
    initRequired.add(s.getter)
    if (s.setter) initRequired.add(s.setter)
  }
  for (const m of ctx.memos) initRequired.add(m.name)
  for (const p of ctx.propsParams) initRequired.add(p.name)
  if (ctx.propsObjectName) initRequired.add(ctx.propsObjectName)
  for (const c of ctx.localConstants) {
    if (constantScope.get(c.name) === 'init') initRequired.add(c.name)
  }

  let pending: FunctionInfo[] = []
  for (const fn of ctx.localFunctions) {
    if (fn.isJsxFunction) { functionScope.set(fn.name, 'skip'); continue }
    if (fn.isMultiReturnJsxHelper) { functionScope.set(fn.name, 'skip'); continue }
    if (!usedIdentifiers.has(fn.name)) { functionScope.set(fn.name, 'skip'); continue }
    if (!fn.isModule) { functionScope.set(fn.name, 'init'); continue }
    pending.push(fn)
  }

  let changed = true
  while (changed) {
    changed = false
    const stillPending: FunctionInfo[] = []
    for (const fn of pending) {
      const refs = graphFunctionReferences(graph, fn.name)
      // Parameters shadow outer names inside the function body.
      for (const p of fn.params) refs.delete(p.name)
      const referencesInit = [...refs].some(r => initRequired.has(r))
      if (referencesInit) {
        functionScope.set(fn.name, 'init')
        initRequired.add(fn.name)
        changed = true
      } else {
        stillPending.push(fn)
      }
    }
    pending = stillPending
  }
  for (const fn of pending) functionScope.set(fn.name, 'module')

  return { constantScope, functionScope }
}

function classifyConstant(
  c: ConstantInfo,
  usedIdentifiers: Set<string>,
  initStmtAssigned: Set<string>,
  providerContextNames: Set<string>,
): DeclarationScope {
  if (c.isJsx) return 'skip'           // Inlined at IR level (#547)
  if (c.isJsxFunction) return 'skip'   // Inlined at call sites (#569)

  // A provider's context constant must be emitted even if nothing else
  // in the component references it — the provider setup reads it
  // through `providerSetups[*].contextName`, which was NOT tracked in
  // the pre-Stage B reachability walks and so the old classifier
  // handled this case in a separate post-pass (generate-init.ts
  // L154-164). With the graph in place, we express it as a first-class
  // "force include" rule here.
  const isProviderContext = c.systemConstructKind === 'createContext'
    && providerContextNames.has(c.name)
  if (!usedIdentifiers.has(c.name) && !isProviderContext) return 'skip'

  if (!c.value) return 'init'   // `let x` placeholder
  if (c.systemConstructKind) return 'module'
  if (c.isModule && initStmtAssigned.has(c.name)) return 'module'
  return 'init'
}
