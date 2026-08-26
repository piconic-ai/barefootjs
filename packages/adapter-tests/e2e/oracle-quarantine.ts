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
      "First accordion item's trigger SSRs the hard-coded aria-expanded=\"false\" literal; hydration's mount effect corrects it to \"true\" (the sibling data-state attributes are compiler-analyzable expressions and SSR correctly). Idempotence: replaying the two click steps times out (10s) waiting for the second item's trigger — its [data-value] locator never matches on the leg whose mount effects haven't stamped it yet.",
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
  // Unexplained expando `.value` DOM PROPERTY (not attribute — `dom-
  // state.ts` reads the IDL property) appears on a plain, non-form-
  // control root element after hydration, absent pre-hydration. Traced
  // to `apply-rest-attrs.ts`'s unconditional `el.value = …` write for any
  // spread `value` key (`ChildProps.value` here is a plain numeric data
  // prop, not a form control's value) — worth confirming that's really
  // the path hit for a `<div>` root that spreads nothing itself.
  'props-reactivity-comparison': {
    oracles: ['snap', 'three-point'],
    reason: 'PropsStyleChild/DestructuredStyleChild root <div> gains a live .value=1 DOM property after hydration that is absent pre-hydration.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2716',
  },
  'reactive-props': {
    oracles: ['snap', 'three-point'],
    reason: 'ReactiveChild root <div> gains a live .value=0 DOM property after hydration that is absent pre-hydration (same shape as props-reactivity-comparison).',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2716',
  },
  tabs: {
    oracles: ['snap', 'three-point', 'idempotence'],
    reason: 'Tabs root <div> gains a live .value="account" DOM property after hydration that is absent pre-hydration (same shape as props-reactivity-comparison). Idempotence: replaying its two click steps times out (10s) waiting for the second tab trigger — its [data-value] locator never matches in one leg.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2716',
  },
  'todo-app': {
    oracles: ['snap', 'three-point'],
    reason: 'Large structural divergence after hydration (footer/filter/count section reflow) — needs a focused diff, not yet narrowed to one attribute/element.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2719',
  },
}
