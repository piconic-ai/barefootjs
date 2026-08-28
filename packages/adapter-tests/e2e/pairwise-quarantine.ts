/**
 * Pairwise-sweep quarantine ledger (#2481 step 5, browser-oracle leg).
 *
 * `pairwise.playwright.ts` runs the same three oracles `oracle.playwright.ts`
 * and `mutation.playwright.ts` run (`oracle-core.ts`), but against every
 * `status: 'ok'` case `scripts/pairwise-generate.ts` produced from the t=2
 * covering array. Mirrors `mutation-quarantine.ts`'s shape and rot-check
 * discipline exactly (see that file's docstring for the rationale): a bare
 * skip would go silently stale the moment a fix lands, so
 * `pairwise.playwright.ts` instead asserts each quarantined
 * `[caseId, oracle]` pair is STILL failing — a pair that starts passing
 * fails its rot check with a "stale — delete the entry" message.
 *
 * ONE deliberate difference from `mutation-quarantine.ts`: mutation has
 * `baseAlreadyQuarantined`, which skips a mutant's oracle when the SAME
 * oracle is already known-broken on the unmutated base fixture — pairwise
 * has no base fixture (every case is synthesized fresh from the covering
 * array), so there is no equivalent "already known broken" set to inherit
 * from and no analogous skip. Every pairwise oracle failure is a genuine
 * new finding.
 *
 * Key STRICTLY on the exact case id (the full axis-tuple string
 * `scripts/pairwise-generate.ts`'s `idFor` produces) — never on an axis
 * pattern or wildcard. If N cases fail from one root cause, that is N
 * entries sharing one `reason`/`issue`, not one entry matching all of
 * them: a pattern entry is how a quarantine quietly becomes a blanket
 * skip, which is exactly the failure mode this ledger exists to prevent
 * (CLAUDE.md's `known-limitation` discipline, applied here).
 *
 * This ledger starts EMPTY. The first full sweep against this harness is
 * triage input for a human, not something this PR quarantines on its own
 * initiative (see the PR description) — entries land here only once each
 * failure has been individually reviewed and, where warranted, filed as
 * its own `known-limitation` issue.
 */

import type { OracleKind } from './oracle-quarantine'

export interface PairwiseQuarantineEntry {
  caseId: string
  oracle: OracleKind
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /** `known-limitation` issue URL, filled in after triage. */
  issue?: string
}

function key(caseId: string, oracle: OracleKind): string {
  return `${caseId}::${oracle}`
}

const ENTRIES: readonly PairwiseQuarantineEntry[] = []

export const PAIRWISE_QUARANTINE: ReadonlyMap<string, PairwiseQuarantineEntry> = new Map(
  ENTRIES.map(e => [key(e.caseId, e.oracle), e]),
)

export function pairwiseQuarantineEntry(caseId: string, oracle: OracleKind): PairwiseQuarantineEntry | undefined {
  return PAIRWISE_QUARANTINE.get(key(caseId, oracle))
}
