/**
 * Oracle quarantine ledger (#2481).
 *
 * `oracle.playwright.ts` runs three independent oracles per fixture
 * (`'three-point'`, `'snap'`, `'idempotence'` — see that file's docstring
 * for what each checks). A first run against the existing 37-fixture
 * corpus surfaces real divergences the fixture-hydrate layer never
 * checked for; fixing them is out of scope for the harness itself (#2481
 * step 1 only stands the oracle up).
 *
 * Every `[fixtureId, oracle]` pair known to fail is listed here instead
 * of skipped outright, mirroring `csr-skip-set.ts` / `csr-skip-rot.test.ts`
 * (see that pair's docstrings for the rationale): a bare `test.fixme`
 * would go silently stale the moment a fix lands, so `oracle.playwright.ts`
 * instead asserts each quarantined pair is STILL failing — a pair that
 * starts passing fails its rot check with a "stale — delete the entry"
 * message pointing at exactly which pair to remove.
 *
 * `issue` starts undefined for freshly-quarantined pairs; the person
 * triaging the first-run inventory fills it in once a `known-limitation`
 * issue exists for each row (some rows may share one issue).
 */

export type OracleKind = 'three-point' | 'snap' | 'idempotence'

export interface QuarantineEntry {
  /** Which oracle(s) this fixture is quarantined against. */
  oracles: ReadonlyArray<OracleKind>
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /** `known-limitation` issue URL, filled in after triage. */
  issue?: string
}

export const ORACLE_QUARANTINE: Readonly<Record<string, QuarantineEntry>> = {
  // ref-effect-computed attribute state never reaches SSR (#2714,
  // direction corrected 2026-08-26): these components hard-code the
  // DEFAULT as a JSX literal (aria-expanded="false" etc.) and compute the
  // real value inside `ref={handleMount}` (useContext + createEffect),
  // which never runs during SSR — so SSR bakes the literal and the first
  // client effect pass CORRECTS it. The snap/three-point failures record
  // that pre-hydration state genuinely differs from post-hydration state;
  // the side that is wrong is the SSR markup, not hydration.
  accordion: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason:
      "First accordion item's trigger SSRs the hard-coded aria-expanded=\"false\" literal; hydration's mount effect corrects it to \"true\" (the sibling data-state attributes are compiler-analyzable JSX expressions, so SSR renders them correctly). Idempotence: replaying the two click steps times out (10s) waiting for the second item's trigger — its [data-value] locator never matches on the leg whose mount effects haven't stamped it yet.",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2714',
  },
  'radio-group': {
    oracles: ['snap', 'three-point'],
    reason:
      'Default-checked radio item SSRs the hard-coded aria-checked="false" literal; hydration corrects it to "true".',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2714',
  },
  command: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason:
      'Default-selected command item SSRs the hard-coded data-selected="false" (no data-value at all); hydration corrects to data-selected="true" data-value="Calendar". Idempotence: replayed fill steps land on a differently-structured filtered list between the hydrated and csr-mount legs.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2714',
  },
  // Reactive child-prop DOM mirroring has no SSR counterpart (#2715,
  // direction and mechanism corrected 2026-08-26): `emitReactiveChildProps`
  // (emit-reactive.ts) mirrors a non-standard NAMED child prop onto the
  // child's root element via a parent-side createEffect that exists only
  // in client JS — `html-template.ts` has no counterpart — so the mirrored
  // attribute is ABSENT from SSR markup and first appears after hydration.
  // Not a rest-spread path at all; `apply-rest-attrs`/`spread-attrs` were
  // checked and are consistent between SSR-string and CSR-apply modes.
  'branch-root-prop-attr': {
    oracles: ['snap', 'three-point'],
    reason:
      'The child-prop mirror effect adds variant="a" to the child root only after hydration; SSR markup never carries it.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2715',
  },
  combobox: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason:
      'The mirrored placeholder attribute appears only after hydration; SSR markup never carries it. Idempotence: after replaying its click+fill+click sequence the two legs land on differently-ordered body content (a portal-content-vs-main-content ordering difference — see the dialog/popover/portal group below).',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2715',
  },
  select: {
    oracles: ['snap', 'three-point'],
    reason:
      'The mirrored placeholder attribute appears only after hydration; SSR markup never carries it (same shape as combobox).',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2715',
  },
  pagination: {
    oracles: ['snap', 'three-point'],
    reason:
      'The mirrored isactive="true" named-prop attribute appears only after hydration; SSR markup never carries it.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2715',
  },
  'data-table': {
    oracles: ['snap', 'three-point'],
    reason:
      'The mirrored sorted="false" named-prop attribute appears only after hydration; SSR markup never carries it.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2715',
  },
  // Portal-origin marker (`bf-po`) present in the SSR placeholder, gone
  // after hydration moves the portaled content to its real destination —
  // plausibly the INTENDED cleanup once the portal claims its content
  // rather than a bug, but flagged since this oracle has no way to tell
  // "expected marker removal" apart from "lost attribute" on its own —
  // worth a human look before assuming either. The idempotence leg
  // (`oracle.playwright.ts`'s `canonicalizePortalOriginMarker` already
  // normalizes the marker's random-hash SUFFIX away) still disagrees on
  // where in `document.body`'s child order the portal content ends up
  // relative to the main content — a real ordering divergence between
  // the hydrated and csr-mount legs, not a normalization gap.
  dialog: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason: 'SSR placeholder carries bf-po="DialogBasicDemo_test_s1"; gone after hydration relocates the portal content — may be by-design portal cleanup, not a defect. Idempotence: after replaying its actions the portal content sits at a different position in body child order between the hydrated and csr-mount legs.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  'dropdown-menu': {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason: 'SSR placeholder carries bf-po="DropdownMenuCheckboxDemo_test_s5"; gone after hydration — same shape as dialog. Idempotence: same body-child-order divergence as dialog.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  popover: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason: 'SSR placeholder carries bf-po="PopoverBasicDemo_test_s1"; gone after hydration — same shape as dialog. Idempotence: same body-child-order divergence as dialog.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  portal: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason: 'SSR placeholder carries bf-po="PortalExample_test"; gone after hydration — same shape as dialog (this fixture IS the portal primitive demo). Idempotence: same body-child-order divergence as dialog.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  // Layout-dependent: embla measures real geometry, which the CSS-less
  // fixture-hydrate host page can't provide consistently pre/post
  // hydration — the existing `hostStyles` determinism caveat (#1971)
  // already calls this class out for interaction assertions; this oracle
  // hits the same wall on the static transform style.
  carousel: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR bakes style="transform: translate3d(0px, 0px, 0px)" on the track; hydration (embla measuring real, CSS-less-page geometry) removes the inline style — likely the #1971 layout-dependence caveat, not a hydration defect.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2718',
  },
  // `data-key` loop-reconciliation marker present in SSR, gone after
  // hydration claims the row — plausibly intended cleanup, same caveat
  // as the portal-origin-marker group above.
  'tag-cloud': {
    oracles: ['snap', 'three-point'],
    reason: 'SSR <li> carries data-key="1:a &amp; b"; absent after hydration claims the loop row.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2718',
  },
  // tabs' `snap` row (the expando-.value shape, #2716) is gone — the fix
  // there was verified with the real oracle run. `three-point`'s FIRST
  // comparison (SSR vs hydrated) now passes for the same reason, which
  // unmasked a SECOND, previously-hidden comparison inside the same oracle
  // (hydrated vs csr-mount, `runThreePointOracle` in oracle-core.ts runs it
  // only after the first passes): csr-mount's default-active TabsTrigger
  // renders `aria-selected="false" data-state="inactive"` with no
  // `data-value` at all, while the hydrated leg correctly shows
  // `aria-selected="true" data-state="active" data-value="account"` — the
  // csr-mount leg isn't computing the default active tab the same way.
  // Unrelated to #2716's DOM-property write; filed separately as #2728.
  tabs: {
    oracles: ['three-point', 'idempotence'],
    reason:
      "three-point: csr-mount's default-active TabsTrigger disagrees with the hydrated leg on aria-selected/data-state/data-value (see module comment above) — a distinct, previously-masked divergence, not the #2716 .value shape. Idempotence: replaying its two click steps times out (10s) waiting for the second tab trigger — its [data-value] locator never matches in one leg; may or may not share a root cause with the three-point row.",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2728',
  },
  // `/* @client */` placeholders populated after hydration (#2719, narrowed):
  // TodoApp.tsx marks its filtered keyed loop, both todo-count text
  // expressions, and the clear-completed conditional `/* @client */`, so SSR
  // emits empty markers by contract (spec/callback-fidelity.md §4) and the
  // client materializes them — the "large structural divergence" is exactly
  // those four regions and nothing else: with them masked out of the
  // hydrated tree it is byte-identical to SSR, hydrated ≡ csr-mount agree
  // structurally and in DOM state, idempotence passes, and the marker-free
  // twin `todo-app-ssr` passes all three oracles. Not #2714 (no SSR-present
  // attribute is corrected) and not #2715 (no named-prop mirror). Stays
  // quarantined as the executable record: this oracle cannot tell an
  // explicit @client placeholder fill apart from a hydration defect.
  'todo-app': {
    oracles: ['snap', 'three-point'],
    reason:
      'SSR emits the four /* @client */ placeholders empty (<ul class="todo-list"> loop l0, <strong bf="s7"> count, cond s8 \'item\'/\'items\', cond s13 clear-completed button); hydration materializes them. Everything outside those regions is byte-identical, and the three-point\'s hydrated-vs-csr-mount leg agrees — by-design client-only rendering, not a hydration defect.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2719',
  },
}
