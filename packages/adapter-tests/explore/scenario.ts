/**
 * Bounded state-space exploration — scenario model (#3046).
 *
 * A scenario is the unit the explorer (`explorer.ts`) enumerates and the
 * browser oracle (`e2e/explore.playwright.ts`) checks. It pairs a real,
 * hand-written BarefootJS component with a pure TypeScript model of the
 * SAME transitions, so the harness can ask, for every bounded action
 * sequence:
 *
 *   DOM(initial = S0, then click a1 … an)  ==  DOM(initial = reduce*(S0, a1 … an))
 *
 * i.e. does the compiler's incremental update machinery preserve the
 * declarative meaning of the component, or does it only render the states
 * it happened to start from.
 *
 * The component contract every scenario's `source` must honour:
 *
 *   - It exports `componentName`, taking exactly one prop `initial: S`
 *     and seeding its signal(s) from it. This is what makes "a fresh
 *     render of state S" expressible as an ordinary fixture render with
 *     `props: { initial: S }` — no runtime hook, no test-only entry point.
 *   - For every value in `actions` it renders one `<button
 *     data-action="<name>">` whose click handler performs that action.
 *     The oracle drives transitions through those buttons with the same
 *     `interaction-runner.ts` click every other e2e suite uses, so the
 *     real event → setter → reconcile path is what gets exercised.
 *   - Each handler body is the one-line mirror of the corresponding
 *     `reduce` branch. The two are deliberately NOT generated from one
 *     source yet (see #3046's "start with fixed small bounds before
 *     adding more sophisticated search"): while the scenario set is this
 *     small, a hand-written pair kept trivially parallel is cheaper to
 *     read than a DSL, and `__tests__/scenarios.test.ts` pins at the IR
 *     level that every action button's handler reaches the state setter.
 *     A mismatch between the two surfaces as an oracle failure whose
 *     artifact shows both sides, so it cannot hide — it just costs a
 *     triage round. Revisit when a third scenario makes the mirror
 *     tedious.
 *
 * Every state must live inside the JSON data domain (finite numbers,
 * strings, booleans, `null`, arrays, plain objects): it crosses the
 * `bf-p` hydration boundary and is embedded into the csr-mount boot
 * script by `fixture-host.ts` exactly like any fixture's `props`.
 */

export interface ExploreBounds {
  /** Longest action sequence the explorer enumerates (inclusive). `0` = initial state only. */
  maxDepth: number
}

export interface Scenario<S, A extends string = string> {
  /** Stable id — used in manifest / fixture ids and quarantine keys. kebab-case. */
  id: string
  description: string
  /** The export of `source` to render; must accept `{ initial: S }`. */
  componentName: string
  /** Complete TSX component file honouring the contract in the module docstring. */
  source: string
  initialState: S
  /** The action vocabulary; also the set of `data-action` values `source` renders. */
  actions: readonly A[]
  /**
   * Getter names of the signals that hold the modelled state (`items`,
   * not `setItems`). The IR smoke test (`__tests__/scenarios.test.ts`)
   * pins that every action button's handler reaches one of their setters
   * — the cheapest possible "the wiring exists" check before a browser is
   * ever involved.
   */
  stateSignals: readonly string[]
  /** Pure model of the component's transitions. Must not mutate `state`. */
  reduce(state: S, action: A): S
  bounds: ExploreBounds
}

/**
 * Deterministic canonical key for a state — the dedupe key the explorer
 * uses so two action sequences reaching the same state share one
 * fresh-render fixture. Object keys are sorted recursively; array order
 * is significant (it is DOM order for a loop).
 */
export function canonicalStateKey(state: unknown): string {
  return JSON.stringify(sortKeysDeep(state))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/** Structural clone via JSON — states are JSON-domain by contract, so this is lossless. */
export function cloneState<S>(state: S): S {
  return JSON.parse(JSON.stringify(state)) as S
}

/**
 * The action sequence as a stable, readable path id. The empty sequence
 * is `'initial'`; otherwise action names joined with `>` (a character no
 * action name may contain — enforced by `assertScenarioShape`).
 */
export function pathId(actions: ReadonlyArray<string>): string {
  return actions.length === 0 ? 'initial' : actions.join('>')
}

/**
 * Cheap structural validation of a scenario definition, run by the
 * explorer before enumerating and by the scenario unit test. Catches the
 * mistakes a typo would otherwise turn into a silent "the oracle never
 * clicked anything" run.
 */
export function assertScenarioShape<S, A extends string>(scenario: Scenario<S, A>): void {
  if (!/^[a-z][a-z0-9-]*$/.test(scenario.id)) {
    throw new Error(`explore: scenario id '${scenario.id}' must be kebab-case`)
  }
  if (scenario.actions.length === 0) {
    throw new Error(`explore: scenario '${scenario.id}' declares no actions`)
  }
  const seen = new Set<string>()
  for (const action of scenario.actions) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(action)) {
      throw new Error(`explore: scenario '${scenario.id}' action '${action}' must match /^[a-zA-Z][a-zA-Z0-9-]*$/`)
    }
    if (seen.has(action)) throw new Error(`explore: scenario '${scenario.id}' declares action '${action}' twice`)
    seen.add(action)
    if (!scenario.source.includes(`data-action="${action}"`)) {
      throw new Error(
        `explore: scenario '${scenario.id}' declares action '${action}' but its source renders no <button data-action="${action}">`,
      )
    }
  }
  if (!Number.isInteger(scenario.bounds.maxDepth) || scenario.bounds.maxDepth < 0) {
    throw new Error(`explore: scenario '${scenario.id}' bounds.maxDepth must be a non-negative integer`)
  }
  // JSON-domain check: a state that does not round-trip cannot cross bf-p.
  const roundTripped = canonicalStateKey(JSON.parse(JSON.stringify(scenario.initialState)))
  if (roundTripped !== canonicalStateKey(scenario.initialState)) {
    throw new Error(`explore: scenario '${scenario.id}' initialState is not JSON-domain`)
  }
}
