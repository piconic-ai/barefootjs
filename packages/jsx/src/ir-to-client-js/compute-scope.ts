/**
 * Declaration scope classifier.
 *
 * Pure function of `ClientJsContext` + `ReferencesGraph`. Returns the
 * emission scope (`module` | `init` | `skip`) for every local constant
 * and every local function, replacing the ad-hoc cascade that used to
 * live inline in `generate-init.ts`.
 *
 * Stage C of issue #1021 — analysis-on-IR refactor.
 */

import type {
  ConstantInfo,
  DeclarationScope,
  FunctionInfo,
  ReferencesGraph,
} from '../types.ts'
import type { ClientJsContext } from './types.ts'
import {
  graphAssignedIdentifiers,
  graphFunctionReferences,
  graphUsedIdentifiers,
} from './build-references.ts'
import { signalSecondBinding } from '../signal-initializer.ts'

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
  // Constants — immediate classification
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
  //   6. isModule + arrow-valued         → deferred to the fixpoint below (#2988)
  //   7. otherwise                       → init
  //
  // Step 6 is new (#2988): an arrow-valued module-level const closing
  // over nothing but its own params (`const fmt = (s) => s.toUpperCase()`)
  // is exactly the shape a `function fmt(s) { ... }` declaration already
  // gets right via the forward-reachability fixpoint just below — the
  // pre-#2988 cascade had no fixpoint-reachability equivalent for
  // constants and fell straight to `init`, which silently disagreed with
  // `compute-inlinability.ts`'s independent (and, for constants,
  // unconditional) `arrow-literal` verdict and produced an empty CSR
  // template seed. Scoped to arrow-valued constants specifically, not
  // every value-bearing module constant — widening the fixpoint to cover
  // every module constant shape is a larger, separately-scoped change.
  // ============================================================================

  const providerContextNames = new Set<string>()
  for (const p of ctx.providerSetups) providerContextNames.add(p.contextName)

  const pendingConstants: ConstantInfo[] = []
  for (const c of ctx.localConstants) {
    const immediate = classifyConstantImmediate(c, usedIdentifiers, initStmtAssigned, providerContextNames)
    if (immediate === 'pending-fixpoint') {
      pendingConstants.push(c)
    } else {
      constantScope.set(c.name, immediate)
    }
  }

  // ============================================================================
  // Functions + deferred constants — forward-reachability fixpoint
  //
  // Seed `initRequired` with anything that must live inside the init
  // function (reactive roots, props, and every constant classified as
  // `init` above). Then walk every module-level candidate — functions
  // AND, as of #2988, the arrow-valued constants deferred above: if its
  // body/value references any name in the set, demote it to init scope
  // and add its own name so transitive callers demote in the next
  // iteration. Loop until stable. Survivors are `module`. Mirrors
  // generate-init.ts L218-280 (pre-Stage C) for functions; constants
  // join the same fixpoint rather than getting a second, independent
  // implementation of the same reachability question.
  //
  // Functions read their reference set from the graph's (regex-derived,
  // not scope-aware) `graphFunctionReferences`, so `fn.params` must be
  // stripped explicitly. Constants use `c.freeIdentifiers` instead — the
  // analyzer's TS-AST walk (`extractFreeIdentifiersFromNode`) already
  // excludes an arrow's own bound parameter names, so no equivalent
  // stripping is needed here.
  // ============================================================================

  const initRequired = new Set<string>()
  for (const s of ctx.signals) {
    initRequired.add(s.getter)
    const second = signalSecondBinding(s)
    if (second) initRequired.add(second)
  }
  for (const m of ctx.memos) initRequired.add(m.name)
  for (const p of ctx.propsParams) initRequired.add(p.name)
  if (ctx.propsObjectName) initRequired.add(ctx.propsObjectName)
  for (const c of ctx.localConstants) {
    if (constantScope.get(c.name) === 'init') initRequired.add(c.name)
  }

  let pendingFns: FunctionInfo[] = []
  for (const fn of ctx.localFunctions) {
    if (fn.isJsxFunction) { functionScope.set(fn.name, 'skip'); continue }
    if (fn.isMultiReturnJsxHelper) { functionScope.set(fn.name, 'skip'); continue }
    if (!usedIdentifiers.has(fn.name)) { functionScope.set(fn.name, 'skip'); continue }
    if (!fn.isModule) { functionScope.set(fn.name, 'init'); continue }
    pendingFns.push(fn)
  }
  let pendingConsts = pendingConstants

  let changed = true
  while (changed) {
    changed = false

    const stillPendingFns: FunctionInfo[] = []
    for (const fn of pendingFns) {
      const refs = graphFunctionReferences(graph, fn.name)
      // Parameters shadow outer names inside the function body.
      for (const p of fn.params) refs.delete(p.name)
      const referencesInit = [...refs].some(r => initRequired.has(r))
      if (referencesInit) {
        functionScope.set(fn.name, 'init')
        initRequired.add(fn.name)
        changed = true
      } else {
        stillPendingFns.push(fn)
      }
    }
    pendingFns = stillPendingFns

    const stillPendingConsts: ConstantInfo[] = []
    for (const c of pendingConsts) {
      const refs = c.freeIdentifiers ?? new Set<string>()
      const referencesInit = [...refs].some(r => initRequired.has(r))
      if (referencesInit) {
        constantScope.set(c.name, 'init')
        initRequired.add(c.name)
        changed = true
      } else {
        stillPendingConsts.push(c)
      }
    }
    pendingConsts = stillPendingConsts
  }
  for (const fn of pendingFns) functionScope.set(fn.name, 'module')
  for (const c of pendingConsts) constantScope.set(c.name, 'module')

  return { constantScope, functionScope }
}

/**
 * Immediate (non-fixpoint) constant classification. Returns
 * `'pending-fixpoint'` for the one case (#2988) that can't be decided
 * without the reachability walk `computeDeclarationScopes` runs after
 * this — the caller collects those into `pendingConstants` instead of
 * setting a scope here.
 */
function classifyConstantImmediate(
  c: ConstantInfo,
  usedIdentifiers: Set<string>,
  initStmtAssigned: Set<string>,
  providerContextNames: Set<string>,
): DeclarationScope | 'pending-fixpoint' {
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
  if (c.isModule && c.containsArrow) return 'pending-fixpoint'   // #2988
  return 'init'
}
