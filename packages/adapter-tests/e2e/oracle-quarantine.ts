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
  // `idempotence` graduated alongside #2728 (same root cause: the second
  // item's trigger sits inside the same comment-wrapper composition).
  // `snap`/`three-point` are a separate, unrelated divergence (see reason
  // below) and stay quarantined.
  accordion: {
    oracles: ['snap', 'three-point'],
    reason:
      "First accordion item's trigger SSRs the hard-coded aria-expanded=\"false\" literal; hydration's mount effect corrects it to \"true\" (the sibling data-state attributes are compiler-analyzable JSX expressions, so SSR renders them correctly).",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2714',
  },
  'radio-group': {
    oracles: ['snap', 'three-point'],
    reason:
      'Default-checked radio item SSRs the hard-coded aria-checked="false" literal; hydration corrects it to "true".',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2714',
  },
  // `idempotence` moved to `IDEMPOTENCE_EXCLUDED` (#2827) instead of
  // graduating like `accordion`'s: measured bimodal (a genuine structural
  // divergence some runs, agreement others), so the ledger's "reliably
  // fails" assumption doesn't hold for this pair.
  command: {
    oracles: ['snap', 'three-point'],
    reason:
      'Default-selected command item SSRs the hard-coded data-selected="false" (no data-value at all); hydration corrects to data-selected="true" data-value="Calendar".',
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
  // `idempotence` moved to `IDEMPOTENCE_EXCLUDED` once #2717 fixed the
  // portal-content-vs-main-content body-order divergence this row used to
  // record (see the dialog/popover/portal group below): with the ordering
  // agreed, the pair is bimodal on the `combobox-empty` row's `hidden`
  // attribute (same class as `command`, #2827), so the ledger's "reliably
  // fails" assumption no longer holds. The remaining oracles are the
  // #2715 placeholder mirror.
  combobox: {
    oracles: ['snap', 'three-point'],
    reason:
      'The mirrored placeholder attribute appears only after hydration; SSR markup never carries it.',
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
  // worth a human look before assuming either.
  // `idempotence` graduated (#2717): the hydrated and csr-mount legs used
  // to disagree on where in `document.body`'s child order the portal
  // content sits relative to the main content — `[root, …portals]` vs
  // `[…portals, root]`, because a bare `createComponent()` runs `init`
  // (and the `ref` → `createPortal` calls) before its caller appends the
  // root. Fixed in `createPortal` (`packages/client/src/runtime/portal.ts`):
  // a portal is still appended at call time, and is re-appended (moved to
  // the container's end) once its `ownerScope` connects, so both paths
  // land on the hydration order. Verified with the real
  // oracle run; the measured divergence was present before any action
  // step ran, so it was a mount-order defect, not an interaction one.
  dialog: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="DialogBasicDemo_test_s1"; gone after hydration relocates the portal content — may be by-design portal cleanup, not a defect.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  'dropdown-menu': {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="DropdownMenuCheckboxDemo_test_s5"; gone after hydration — same shape as dialog.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  popover: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="PopoverBasicDemo_test_s1"; gone after hydration — same shape as dialog.',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2717',
  },
  portal: {
    oracles: ['snap', 'three-point'],
    reason: 'SSR placeholder carries bf-po="PortalExample_test"; gone after hydration — same shape as dialog (this fixture IS the portal primitive demo).',
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
  // `tabs` graduated (#2728): fixed in `materializeComponent`
  // (`packages/client/src/runtime/component.ts`) — see the changeset for
  // the root-cause narrative. Verified with the real oracle run.
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
  //
  // A fifth `/* @client */` site, the toggle-all checkbox's
  // `checked={/* @client */ todos().every(t => t.done)}`, is untouched by
  // the masking above. It doesn't currently widen the divergence: SSR omits
  // the `checked` attribute entirely, and this fixture's `initialTodos` has
  // 2 of 3 items undone, so `every()` evaluates `false` — coincidentally
  // the same as the absent-attribute default. If `initialTodos` ever became
  // all-done, `every()` would flip `true` and this region would start
  // diverging too.
  'todo-app': {
    oracles: ['snap', 'three-point'],
    reason:
      'SSR emits the four /* @client */ placeholders empty (<ul class="todo-list"> loop l0, <strong bf="s7"> count, cond s8 \'item\'/\'items\', cond s13 clear-completed button); hydration materializes them. Everything outside those regions is byte-identical, and the three-point\'s hydrated-vs-csr-mount leg agrees — by-design client-only rendering, not a hydration defect. (A fifth /* @client */ site, the toggle-all checkbox\'s `checked` binding, is untouched by this masking — SSR omits the attribute entirely and the fixture\'s seeded data happens to match that default; see the module comment above.)',
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2719',
  },
}
