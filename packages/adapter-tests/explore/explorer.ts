/**
 * Bounded breadth-first enumeration of a scenario's action sequences
 * (#3046, "Bounded exploration").
 *
 * Output has two halves the browser leg consumes differently:
 *
 *   - `states`: every DISTINCT state reachable within `bounds.maxDepth`,
 *     keyed by `canonicalStateKey`, in discovery order. Each becomes one
 *     fresh-render fixture (`props: { initial: state }`), so the number of
 *     SSR renders is the number of distinct states, not the number of
 *     paths.
 *   - `paths`: EVERY action sequence of length 0..maxDepth, in BFS order,
 *     each resolved to the state key it ends in. Paths are deliberately
 *     not deduped by end state: `append>removeLast` and `initial` end in
 *     the same state, but they exercise different incremental machinery,
 *     and a no-op transition (`cloneAll`) ending where it started is
 *     exactly the "replace with equal-looking values" case the proposal
 *     calls out. Every prefix of a path is itself a path, so the shortest
 *     failing sequence is always in the list — cheap minimisation for
 *     free at these bounds.
 *
 * Deterministic by construction: the same scenario always yields the same
 * arrays in the same order (actions are visited in declaration order).
 */

import { assertScenarioShape, canonicalStateKey, cloneState, pathId, type Scenario } from './scenario'

export interface ExploredState<S> {
  /** Position in discovery order — the fixture id suffix (`<scenario>__s<index>`). */
  index: number
  key: string
  state: S
}

export interface ExploredPath<A extends string> {
  id: string
  actions: readonly A[]
  /** `canonicalStateKey` of the state this path starts from (always the initial state). */
  fromKey: string
  /** `canonicalStateKey` of the state this path ends in. */
  toKey: string
}

export interface Exploration<S, A extends string> {
  scenarioId: string
  maxDepth: number
  states: ExploredState<S>[]
  paths: ExploredPath<A>[]
}

export function explore<S, A extends string>(scenario: Scenario<S, A>): Exploration<S, A> {
  assertScenarioShape(scenario)
  const { maxDepth } = scenario.bounds

  const states: ExploredState<S>[] = []
  const byKey = new Map<string, ExploredState<S>>()
  const intern = (state: S): ExploredState<S> => {
    const key = canonicalStateKey(state)
    let entry = byKey.get(key)
    if (!entry) {
      entry = { index: states.length, key, state: cloneState(state) }
      byKey.set(key, entry)
      states.push(entry)
    }
    return entry
  }

  const initial = intern(scenario.initialState)
  const paths: ExploredPath<A>[] = []

  // BFS frontier: (actions so far, state reached). Depth d expands to d+1
  // by appending each action in declaration order.
  let frontier: Array<{ actions: A[]; state: S }> = [{ actions: [], state: initial.state }]
  for (let depth = 0; depth <= maxDepth; depth++) {
    const next: Array<{ actions: A[]; state: S }> = []
    for (const node of frontier) {
      const end = intern(node.state)
      paths.push({ id: pathId(node.actions), actions: node.actions, fromKey: initial.key, toKey: end.key })
      if (depth === maxDepth) continue
      for (const action of scenario.actions) {
        // `reduce` must not mutate — hand it a clone so a scenario that
        // accidentally does cannot corrupt the sibling branches either.
        const reduced = scenario.reduce(cloneState(node.state), action)
        next.push({ actions: [...node.actions, action], state: reduced })
      }
    }
    frontier = next
  }

  return { scenarioId: scenario.id, maxDepth, states, paths }
}

/** Number of paths a scenario with `k` actions yields at `maxDepth` d: 1 + k + k² + … + kᵈ. */
export function expectedPathCount(actionCount: number, maxDepth: number): number {
  let total = 0
  for (let d = 0; d <= maxDepth; d++) total += actionCount ** d
  return total
}
