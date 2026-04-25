/**
 * Dependency-based topological sort for component declarations.
 *
 * Replaces the rigid 3-phase ordering system (early constants → functions →
 * signals/memos) with a general dependency graph that correctly handles
 * cross-phase dependencies like `form.field('email')` depending on
 * `form = createForm({onSubmit: async () => {}})` (#508).
 */

import type { ConstantInfo, FunctionInfo, MemoInfo, ReferencesGraph, SignalInfo } from '../types'
import { graphDeclarationReferences } from './build-references'

// =============================================================================
// Declaration types
// =============================================================================

export type Declaration =
  | { kind: 'constant'; info: ConstantInfo; sourceIndex: number }
  | { kind: 'signal'; info: SignalInfo; controlledPropName: string | null; sourceIndex: number }
  | { kind: 'memo'; info: MemoInfo; sourceIndex: number }
  | { kind: 'function'; info: FunctionInfo; sourceIndex: number }

/**
 * Return the names defined by a declaration.
 * Signals define both getter and setter names.
 */
export function providedNames(decl: Declaration): string[] {
  switch (decl.kind) {
    case 'constant':
      return [decl.info.name]
    case 'signal':
      return decl.info.setter ? [decl.info.getter, decl.info.setter] : [decl.info.getter]
    case 'memo':
      return [decl.info.name]
    case 'function':
      return [decl.info.name]
  }
}

/**
 * Identifiers referenced by a declaration's initializer/body, read from
 * the precomputed graph instead of re-extracting via regex. For signals
 * the graph is keyed by the getter name (the canonical declaration
 * name). Function params are subtracted because the fixpoint convention
 * treats params as locally bound, not deps.
 */
function referencedIdentifiers(decl: Declaration, graph: ReferencesGraph): Set<string> {
  switch (decl.kind) {
    case 'constant':
      return graphDeclarationReferences(graph, 'constant', decl.info.name)
    case 'signal':
      return graphDeclarationReferences(graph, 'signal', decl.info.getter)
    case 'memo':
      return graphDeclarationReferences(graph, 'memo', decl.info.name)
    case 'function': {
      const refs = graphDeclarationReferences(graph, 'function', decl.info.name)
      for (const p of decl.info.params) refs.delete(p.name)
      return refs
    }
  }
}

// =============================================================================
// Topological sort
// =============================================================================

/**
 * Sort declarations by dependency order using Kahn's algorithm.
 * Falls back to source order for independent declarations and cycles.
 *
 * @param declarations - All declarations to sort
 * @param declNameSet - Set of all names defined by declarations in scope
 *   (used to filter references to external/global names)
 */
export function sortDeclarations(
  declarations: Declaration[],
  declNameSet: Set<string>,
  graph: ReferencesGraph,
): Declaration[] {
  const n = declarations.length
  if (n <= 1) return declarations

  // Map from name → declaration index
  const nameToIdx = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    for (const name of providedNames(declarations[i])) {
      nameToIdx.set(name, i)
    }
  }

  // Build adjacency list: edges[i] = set of declaration indices that i depends on
  const inDegree = new Array<number>(n).fill(0)
  const dependents = new Array<Set<number>>(n)
  for (let i = 0; i < n; i++) {
    dependents[i] = new Set()
  }

  for (let i = 0; i < n; i++) {
    const refs = referencedIdentifiers(declarations[i], graph)
    const ownNames = new Set(providedNames(declarations[i]))
    const depIndices = new Set<number>()

    for (const ref of refs) {
      if (ownNames.has(ref)) continue // self-reference
      if (!declNameSet.has(ref)) continue // external name
      const depIdx = nameToIdx.get(ref)
      if (depIdx !== undefined && depIdx !== i && !depIndices.has(depIdx)) {
        depIndices.add(depIdx)
        inDegree[i]++
        dependents[depIdx].add(i)
      }
    }
  }

  // Kahn's algorithm with source-order tiebreaking (min-heap by sourceIndex)
  // Using a simple sorted-insert approach since n is small (typically < 20)
  const ready: number[] = []
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) {
      ready.push(i)
    }
  }
  // Sort by sourceIndex for stable ordering
  ready.sort((a, b) => declarations[a].sourceIndex - declarations[b].sourceIndex)

  const result: Declaration[] = []
  const visited = new Set<number>()

  while (ready.length > 0) {
    const idx = ready.shift()!
    if (visited.has(idx)) continue
    visited.add(idx)
    result.push(declarations[idx])

    for (const dep of dependents[idx]) {
      inDegree[dep]--
      if (inDegree[dep] === 0) {
        // Insert in sorted order by sourceIndex
        const si = declarations[dep].sourceIndex
        let insertAt = ready.length
        for (let j = 0; j < ready.length; j++) {
          if (declarations[ready[j]].sourceIndex > si) {
            insertAt = j
            break
          }
        }
        ready.splice(insertAt, 0, dep)
      }
    }
  }

  // If there are cycles, append remaining declarations in source order
  if (result.length < n) {
    const remaining: number[] = []
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) remaining.push(i)
    }
    remaining.sort((a, b) => declarations[a].sourceIndex - declarations[b].sourceIndex)
    for (const idx of remaining) {
      result.push(declarations[idx])
    }
  }

  return result
}
