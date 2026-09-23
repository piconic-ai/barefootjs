/**
 * `fixture-hydrate.playwright.ts` quarantine ledger (#3107).
 *
 * `fixture-hydrate.playwright.ts` runs every fixture's declared
 * `interactions` end to end and requires ALL of them to pass — there was
 * previously no way to land a fixture whose `interactions` describe the
 * CORRECT behavior when the compiler doesn't deliver it yet. That is
 * exactly the situation a `silent` known limitation is in: the fixture
 * exists specifically to pin the gap (per CLAUDE.md's "a reproducible
 * defect lands as a fixture, not a prose report" rule), so its
 * `interactions` are written to the CONTRACT, not to today's broken
 * output, and are expected to fail until the compiler is fixed.
 *
 * Same shape and rot-check discipline as `oracle-quarantine.ts`'s
 * `ORACLE_QUARANTINE` (see that file's docstring): a fixture id listed
 * here is expected to STILL fail its `interactions` run — `runStep`
 * throwing partway through is the expected outcome, not the test result.
 * `fixture-hydrate.playwright.ts`'s `runQuarantined` asserts that: an
 * unexpectedly PASSING quarantined fixture throws "entry is stale —
 * delete it," never a silent skip, so a fix that lands without touching
 * this ledger is caught immediately instead of leaving a stale entry
 * masking the fixture's own regression-test value.
 *
 * A row cites the registry limitation it is an instance of (`limitation`,
 * `packages/adapter-tests/limitations/<id>.ts`, kind `silent`) — the same
 * field name as `oracle-quarantine.ts`'s `QuarantineEntry` — and the
 * compat join test (`limitations-join.test.ts`) checks the id exists and
 * that the entry lists this fixture.
 */

export interface HydrateQuarantineEntry {
  /** Why the fixture's `interactions` are expected to fail — a short human summary. */
  reason: string
  /** Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). */
  limitation: string
}

export const FIXTURE_HYDRATE_QUARANTINE: Readonly<Record<string, HydrateQuarantineEntry>> = {
  // #3107: a .map() loop row calls a child component with a JSX element
  // as `children`; that element's own reactive attributes never get an
  // effect at all, so they stay frozen at whatever the SSR render held.
  // The fixture's `interactions` describe the CORRECT post-click state
  // (see `fixtures/loop-row-child-children-attrs.ts`) and fail today.
  'loop-row-child-children-attrs': {
    reason:
      "the <a> children element's href/data-current attributes never patch after the toggle click — no effect is ever emitted for them, so they stay at their SSR values",
    limitation: 'loop-row-child-children-attrs-frozen',
  },
  // A child inside a reactive conditional branch active at hydration is
  // initialized twice (found by the explore sweep's
  // `child-listener-cleanup` scenario). The fixture's `interactions`
  // describe the CORRECT counts (see
  // `fixtures/conditional-child-listener-cleanup.ts`) and fail today.
  'conditional-child-listener-cleanup': {
    reason:
      "one ping counts twice (the child's onMount listener is registered by two instances), and one listener survives the branch's removal",
    limitation: 'conditional-branch-child-double-init',
  },
}
