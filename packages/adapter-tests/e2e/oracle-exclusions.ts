/**
 * Oracle exclusion maps shared by `oracle.playwright.ts` and
 * `mutation.playwright.ts` — one decision, one implementation: a fixture
 * whose comparison is inherently non-deterministic on the CSS-less host
 * page is excluded from that oracle for its base run AND for every mutant
 * of it (a mutant inherits the same host page and the same action steps),
 * so the two suites can never disagree about which pairs are measurable.
 *
 * Exclusion is NOT quarantine: a quarantined pair reliably fails and is
 * rot-checked; an excluded pair cannot be compared at all.
 */

/**
 * Fixtures excluded from the `'csr-mount'` leg (and therefore from
 * `'three-point'`), by declared id, with a reason. Reserved for a
 * fixture whose `props` can't survive the JSON round-trip
 * `fixture-host.ts`'s csr-mount boot script embeds them with — none of
 * the current shared fixtures need this (their props already cross
 * the SSR `bf-p` JSON boundary, which demands the same domain), but a
 * future fixture with e.g. a function prop would need it.
 */
export const CSR_MOUNT_EXCLUDED: ReadonlyMap<string, string> = new Map([])

/**
 * Fixtures excluded from the `'idempotence'` oracle, by declared id, with
 * a reason. Reserved for a fixture whose comparison is inherently flaky
 * independent of any real idempotence bug — because its action steps are
 * position/timing-dependent (`carousel`'s `drag` step, see the
 * determinism caveat already documented on `InteractionStep`'s `'drag'`
 * variant, `src/types.ts`, and #1971) — the quarantine ledger can't
 * express "reliably fails" for a pair that isn't.
 *
 * `command` and `combobox` used to sit here as "bimodal" (#2827). They
 * were not harness flakes: both components computed their group/empty
 * `hidden` attributes and `data-selected` highlight inside
 * `requestAnimationFrame` callbacks scheduled from an effect, i.e. one
 * frame AFTER the items' own `hidden` writes, and this oracle captures
 * right after the last action with no frame in between — so which leg
 * had seen its frame decided the comparison. Fixed at the source: the
 * root now owns an item registry signal and every visibility answer is
 * a synchronous memo over it (`ui/components/ui/command/index.tsx`,
 * `ui/components/ui/combobox/index.tsx`). Measured 10/10 agreeing on
 * both fixtures with `--repeat-each=10 --workers=1` after the fix, versus
 * 3/8 and 2/8 diverging before it.
 */
export const IDEMPOTENCE_EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    'carousel',
    "drag steps are pointer-position-dependent on a CSS-less host page (src/types.ts's 'drag' variant docstring, #1971) — replaying the same drag twice for comparison would be flaky independent of any real idempotence bug.",
  ],
])
