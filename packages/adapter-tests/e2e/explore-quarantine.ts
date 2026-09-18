/**
 * Bounded-exploration quarantine ledger (#3046).
 *
 * `explore.playwright.ts` runs two kinds of check per scenario:
 *
 *   - per reachable STATE: the existing `snap` / `three-point` oracles
 *     (`oracle-core.ts`) against that state's fresh fixture — keyed here
 *     on `state:s<index>` (the state's discovery index in the manifest).
 *   - per action PATH: the transition oracles (`transition-hydrate`,
 *     `transition-csr`) — "click this sequence from the initial state,
 *     then compare against a fresh render of the reduced state" — keyed
 *     on the path id (`append>removeLast`).
 *
 * Same rot-check discipline as `pairwise-quarantine.ts`: a quarantined
 * row is asserted to STILL fail, so a fix that lands turns the row into a
 * loud "stale — delete the entry" failure instead of a silent skip that
 * outlives the bug. Key STRICTLY on the exact (scenario, subject, oracle)
 * triple — never a pattern: N paths failing from one root cause are N
 * rows sharing one `reason`/`limitation`, not one wildcard row.
 *
 * Every row cites a `silent` entry in the known-limitation registry
 * (`packages/adapter-tests/limitations/<id>.ts`); the compat join test
 * (`packages/compat/src/__tests__/limitations-join.test.ts`) checks the
 * id exists. A generated exploration case is not itself a corpus fixture,
 * so — like the mutation and pairwise ledgers — the entry's `fixtures`
 * list names the minimal committed reproduction, not this case.
 */

import type { OracleKind } from './oracle-quarantine'

export type ExploreOracleKind = OracleKind | 'transition-hydrate' | 'transition-csr'

export interface ExploreQuarantineEntry {
  scenarioId: string
  /** `state:s<index>` for a per-state oracle, or the path id for a transition oracle. */
  subject: string
  oracle: ExploreOracleKind
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /** Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). */
  limitation: string
}

export function exploreQuarantineKey(scenarioId: string, subject: string, oracle: ExploreOracleKind): string {
  return `${scenarioId}::${subject}::${oracle}`
}

// child-prop-loop, every reachable state, snap + three-point: the parent
// passes `data={data()}` (an object) to `ItemList`, and the compiler's
// reactive child-prop mirroring (`emitReactiveChildProps`) writes it onto
// the child's root `<ul>` as `data="[object Object]"` after hydration, while
// the server HTML carries no such attribute — the registry's
// `child-prop-mirror-attr-ssr` mechanism, here with an object-valued prop
// (so the mirrored text is `[object Object]`, not a variant string).
// Measured 2026-09-18 on every one of the four states the depth-2 sweep
// reaches (empty / one row / two rows / empty-after-append); the transition
// oracles are unaffected because both of their legs are hydrated or both
// csr-mounted, so the attribute is present on both sides.
const MIRROR_ATTR_REASON =
  "Hydration mirrors the `data` object prop onto the child root as `data=\"[object Object]\"`; the SSR HTML has no such attribute, so pre- and post-hydration DOM differ."

const ROWS: ReadonlyArray<ExploreQuarantineEntry> = [
  ...['state:s0', 'state:s1', 'state:s2', 'state:s3'].flatMap((subject): ExploreQuarantineEntry[] =>
    (['snap', 'three-point'] as const).map(oracle => ({
      scenarioId: 'child-prop-loop',
      subject,
      oracle,
      reason: MIRROR_ATTR_REASON,
      limitation: 'child-prop-mirror-attr-ssr',
    })),
  ),
]

export const EXPLORE_QUARANTINE: ReadonlyMap<string, ExploreQuarantineEntry> = new Map(
  ROWS.map(row => [exploreQuarantineKey(row.scenarioId, row.subject, row.oracle), row]),
)

export function exploreQuarantineEntry(
  scenarioId: string,
  subject: string,
  oracle: ExploreOracleKind,
): ExploreQuarantineEntry | undefined {
  return EXPLORE_QUARANTINE.get(exploreQuarantineKey(scenarioId, subject, oracle))
}
