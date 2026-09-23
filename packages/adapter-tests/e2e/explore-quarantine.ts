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
 *     then compare against a fresh render of the reduced state" — and the
 *     keyed-identity oracles (`identity-hydrate`, `identity-csr`) — "every
 *     keyed row whose key survives the sequence is the same DOM node" —
 *     keyed on the path id (`append>removeLast`).
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

export type ExploreOracleKind = OracleKind | 'transition-hydrate' | 'transition-csr' | 'identity-hydrate' | 'identity-csr'

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

// Formerly held 50 rows for `child-prop-loop` and `child-mount-unmount`,
// all citing the registry's `child-prop-mirror-attr-ssr` mechanism
// (`collectReactiveChildProps` / `emitReactiveChildProps` mirroring a
// parent-passed named prop onto a child component's root as a DOM
// attribute the child never renders — `data="[object Object]"` on
// `ItemList`'s `<ul>`, `label="a"` on a client-constructed `Badge`).
// #3055 gated the mirror's generic/presence writes on `target.hasAttribute`
// (`emitAttrUpdate`'s `mirrorPresentOnly`), so the mirror now only ever
// touches an attribute the child's OWN render already put there — it never
// plants one SSR/a fresh client mount wouldn't have. All 50 rows passed and
// were deleted.
//
// `child-listener-cleanup` / `child-effect-disposal`: a child inside a
// reactive conditional branch that is active at hydration / client mount
// is initialized twice, so its onMount listener or effect runs in two
// instances and only one is disposed with the branch. Every path whose
// counter moves while (or after) the child is mounted diverges; the
// minimal committed reproduction is the corpus fixture
// `conditional-child-listener-cleanup` (fixture-hydrate quarantine).
const DOUBLE_INIT = 'conditional-branch-child-double-init'
const LISTENER_REASON = "the conditional child's onMount listener is registered by two instances: each ping counts twice, and one listener survives unmount"
const EFFECT_REASON = "the conditional child's effect runs in two instances: each relabel counts twice, and one effect survives unmount"

const ROWS: ReadonlyArray<ExploreQuarantineEntry> = [
  { scenarioId: 'child-listener-cleanup', subject: 'mount>mount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>mount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>ping>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>unmount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'mount>unmount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>mount>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>ping>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'ping>unmount>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>mount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>mount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>mount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>mount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>unmount', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>ping>unmount', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>unmount>ping', oracle: 'transition-csr', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-listener-cleanup', subject: 'unmount>unmount>ping', oracle: 'transition-hydrate', reason: LISTENER_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>mount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>mount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>relabel>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>unmount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'mount>unmount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>mount>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>relabel>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'relabel>unmount>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>mount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>mount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>mount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>mount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>unmount', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>relabel>unmount', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>unmount>relabel', oracle: 'transition-csr', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
  { scenarioId: 'child-effect-disposal', subject: 'unmount>unmount>relabel', oracle: 'transition-hydrate', reason: EFFECT_REASON, limitation: DOUBLE_INIT },
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
