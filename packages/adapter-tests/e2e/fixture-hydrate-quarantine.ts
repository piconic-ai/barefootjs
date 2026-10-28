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
  // #3107/#3143: `loop-row-child-children-attrs` used to be quarantined
  // here too — the forwarded `<a>`'s href/data-current attributes never
  // patched after the toggle click, because the component-root loop
  // builder never wired the row's own `reactiveAttrs`/`reactiveTexts` into
  // an effect. Fixed (`build-component-loop.ts`'s `reactiveEffects`); the
  // fixture's `interactions` now pass against the Hono reference this spec
  // runs, so the row is gone. Go-template's OWN separate gap on the same
  // fixture (a loop-forwarded child reading an outer signal has no path
  // back to it from its per-row companion template) is unaffected by that
  // fix and stays pinned under the same (narrowed) entry — now a loud
  // BF101 build-time refusal (`conformance-pins.ts`, #3170) rather than a
  // render divergence, but still an adapter-conformance concern, not a
  // hydration-interactions one, so it has no row here.
  // `diamond-propagation` used to be quarantined here too — an effect
  // behind a diamond (one signal → two memos) ran once per edge and its
  // first re-run saw one memo stale. Fixed by the runtime's push-then-pull
  // propagation (`packages/client/src/reactive.ts`); the fixture's
  // `interactions` now pass and it is the fix's regression test.
}
