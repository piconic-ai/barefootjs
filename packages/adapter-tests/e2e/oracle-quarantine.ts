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
  // Reactive boolean/enum attribute resets to its compiled DEFAULT value
  // on hydration instead of the SSR-rendered non-default value — a
  // recurring shape across several unrelated components, all involving a
  // default-open/selected/checked item computed at SSR time from
  // non-empty initial state:
  accordion: {
    oracles: ['snap', 'three-point'],
    reason:
      "First accordion item's trigger SSRs aria-expanded=\"true\" (open by default); after hydration it reads \"false\" while the sibling data-state/grid-rows attributes stay correctly \"open\"/expanded — a partial hydration re-apply.",
  },
  'radio-group': {
    oracles: ['snap', 'three-point'],
    reason: 'Default-checked radio item SSRs aria-checked="true"; after hydration it reads "false".',
  },
  command: {
    oracles: ['snap', 'three-point'],
    reason:
      'Default-selected command item SSRs data-selected="true" data-value="Calendar"; after hydration data-selected reads "false" and data-value is dropped entirely.',
  },
  // Rest-spread (`{...props}`) attribute loss on hydration: an attribute
  // present in the SSR-rendered `{...props}` spread is missing from the
  // live DOM once the client runtime's own init/patch pass runs.
  'branch-root-prop-attr': {
    oracles: ['snap', 'three-point'],
    reason: 'SSR spans variant="a" via {...props} spread; the attribute is absent after hydration.',
  },
  combobox: {
    oracles: ['snap', 'three-point'],
    reason: 'Trigger SSRs an empty placeholder="" attribute; absent after hydration.',
  },
  select: {
    oracles: ['snap', 'three-point'],
    reason: 'Trigger SSRs an empty placeholder="" attribute; absent after hydration (same shape as combobox).',
  },
  pagination: {
    oracles: ['snap', 'three-point'],
    reason: 'Active page link SSRs a lowercased isactive="true" rest-spread attribute; absent after hydration.',
  },
  'data-table': {
    oracles: ['snap', 'three-point'],
    reason: 'Sortable column header SSRs a sorted="false" rest-spread attribute; absent after hydration.',
  },
  // Portal-origin marker (`bf-po`) present in the SSR placeholder, gone
  // after hydration moves the portaled content to its real destination —
  // plausibly the INTENDED cleanup once the portal claims its content
  // rather than a bug, but flagged since this oracle has no way to tell
  // "expected marker removal" apart from "lost attribute" on its own；
  // worth a human look before assuming either.
  dialog: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="DialogBasicDemo_test_s1"; gone after hydration relocates the portal content — may be by-design portal cleanup, not a defect.',
  },
  'dropdown-menu': {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="DropdownMenuCheckboxDemo_test_s5"; gone after hydration — same shape as dialog.',
  },
  popover: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="PopoverBasicDemo_test_s1"; gone after hydration — same shape as dialog.',
  },
  portal: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="PortalExample_test"; gone after hydration — same shape as dialog (this fixture IS the portal primitive demo).',
  },
  // Layout-dependent: embla measures real geometry, which the CSS-less
  // fixture-hydrate host page can't provide consistently pre/post
  // hydration — the existing `hostStyles` determinism caveat (#1971)
  // already calls this class out for interaction assertions; this oracle
  // hits the same wall on the static transform style.
  carousel: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR bakes style="transform: translate3d(0px, 0px, 0px)" on the track; hydration (embla measuring real, CSS-less-page geometry) removes the inline style — likely the #1971 layout-dependence caveat, not a hydration defect.',
  },
  // `data-key` loop-reconciliation marker present in SSR, gone after
  // hydration claims the row — plausibly intended cleanup, same caveat
  // as the portal-origin-marker group above.
  'tag-cloud': {
    oracles: ['snap', 'three-point'],
    reason: 'SSR <li> carries data-key="1:a &amp; b"; absent after hydration claims the loop row.',
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
  },
  'reactive-props': {
    oracles: ['snap', 'three-point'],
    reason: 'ReactiveChild root <div> gains a live .value=0 DOM property after hydration that is absent pre-hydration (same shape as props-reactivity-comparison).',
  },
  tabs: {
    oracles: ['snap', 'three-point'],
    reason: 'Tabs root <div> gains a live .value="account" DOM property after hydration that is absent pre-hydration (same shape as props-reactivity-comparison).',
  },
  'todo-app': {
    oracles: ['snap', 'three-point'],
    reason: 'Large structural divergence after hydration (footer/filter/count section reflow) — needs a focused diff, not yet narrowed to one attribute/element.',
  },
}
