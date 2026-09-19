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
 * A row cites the registry limitation it is an instance of
 * (`limitation`, `packages/adapter-tests/limitations/<id>.ts`, kind
 * `silent`); the compat join test checks the id exists and that the entry
 * lists this fixture. Rows not yet migrated to the registry still carry
 * the `issue` URL they were triaged under.
 */

export type OracleKind = 'three-point' | 'snap' | 'idempotence'

export interface QuarantineEntry {
  /** Which oracle(s) this fixture is quarantined against. */
  oracles: ReadonlyArray<OracleKind>
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /** Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). */
  limitation?: string
  /** Legacy tracking-issue URL, for rows not yet migrated to a registry limitation. */
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
  //
  // `accordion` and `radio-group` graduated (#3065): AccordionTrigger's
  // `aria-expanded` and RadioGroupItem's `aria-checked`/`data-state`/
  // indicator style now come from an explicit prop the caller passes down
  // (`open`, `defaultChecked`) instead of a hard-coded literal, mirroring
  // the carousel's `data-orientation` precedent — SSR and the hydrated DOM
  // now agree.
  // `idempotence` graduated (#2827): the bimodal divergence was the
  // component's own rAF-deferred group/empty `hidden` + `data-selected`
  // writes landing one frame after the item `hidden` writes; the root now
  // derives all of them synchronously from an item-registry signal (see
  // `IDEMPOTENCE_EXCLUDED`'s docstring in `oracle.playwright.ts`).
  command: {
    oracles: ['snap', 'three-point'],
    reason:
      'Default-selected command item SSRs the hard-coded data-selected="false" (no data-value at all); hydration corrects to data-selected="true" data-value="Calendar".',
    limitation: 'ref-effect-attr-state-ssr',
  },
  // Reactive child-prop DOM mirroring has no SSR counterpart (#2715,
  // direction and mechanism corrected 2026-08-26): `emitReactiveChildProps`
  // (emit-reactive.ts) mirrors a non-standard NAMED child prop onto the
  // child's root element via a parent-side createEffect that exists only
  // in client JS — `html-template.ts` has no counterpart — so the mirrored
  // attribute is ABSENT from SSR markup and first appears after hydration.
  // Not a rest-spread path at all; `apply-rest-attrs`/`spread-attrs` were
  // checked and are consistent between SSR-string and CSR-apply modes.
  // Registry limitation `fragment-wrapped-conditional-return-branch-scope`
  // (the `fragment-wrap` mutant shape as real source): the HYDRATED leg
  // renders the fragment-wrapped default branch's root without `bf-s` —
  // hydration never claims the comment-scoped root — while csr-mount gives
  // it one, so three-point diverges structurally. `snap` passes because
  // SSR carries the scope as a comment pair, not as an attribute, so
  // pre- and post-hydration markup look the same. The fixture carries no
  // action step (a click would fail the fixture-hydrate runner for the
  // same reason), so no idempotence pair exists.
  'conditional-return-fragment-branch': {
    oracles: ['three-point'],
    reason:
      'Hydration never claims the fragment-wrapped branch root (no bf-s, events unbound); csr-mount renders it with its scope id.',
    limitation: 'fragment-wrapped-conditional-return-branch-scope',
  },
  // #2852 (fixing #2758) made SSR select a hidden placeholder for an
  // out-of-range controlled select instead of the browser's first-option
  // default; graduated (#3066): the controlled-value effect now falls
  // back to `selectedIndex = 0` (the same placeholder) when the assigned
  // value matches no `<option>`, instead of leaving the browser's own
  // out-of-range resolution (`selectedIndex` -1) as the live post-
  // hydration state — see `emitValueUpdateStatements`'s docstring in
  // `emit-reactive.ts`. The fix is a single tag-gated branch in the one
  // shared codegen function every `<select value={…}>` compiles through
  // regardless of surrounding structure, so the pairwise sweep's
  // `controlled-select` × out-of-range cases (former
  // `select-out-of-range-selected-index` citations, now removed from
  // `pairwise-quarantine.ts`) graduate the same way.
  // `idempotence` graduated in two steps: #2717 fixed the
  // portal-content-vs-main-content body-order divergence this row used to
  // record (see the dialog/popover/portal group below), which left the
  // pair bimodal on the `combobox-empty` row's `hidden` attribute — the
  // same rAF-deferred write as `command` (#2827), fixed the same way. The
  // remaining oracles are the `ComboboxValue`/`SelectValue` `ref` effect
  // that imperatively adds `data-placeholder` to the trigger on hydrate —
  // originally miscategorized here as an instance of the compiler's
  // named-prop child-root mirror; once that mirror was fixed these rows
  // were the survivors, still failing for the hand-written-effect reason,
  // which is the registry's `ref-effect-attr-state-ssr` mechanism (an
  // attribute whose real state is computed in a `ref` callback never
  // reaches SSR), the same entry `accordion` / `radio-group` / `command`
  // cite.
  combobox: {
    oracles: ['snap', 'three-point'],
    reason:
      'The ComboboxValue ref effect adds data-placeholder to the trigger on hydrate; SSR markup never carries it.',
    limitation: 'ref-effect-attr-state-ssr',
  },
  select: {
    oracles: ['snap', 'three-point'],
    reason:
      'The SelectValue ref effect adds data-placeholder to the trigger on hydrate; SSR markup never carries it (same shape as combobox).',
    limitation: 'ref-effect-attr-state-ssr',
  },
  // The mirrored `sorted` attribute this row used to record is fixed; what
  // the quarantine masked underneath is a second, unrelated mechanism: each
  // keyed row's hydration effect rewrites the forwarded cell text with
  // `textContent`, which discards the `<!--bf:^sN-->…<!--/-->` slot markers
  // the server emitted around `{payment.id}` etc. Measured on the base
  // commit with the quarantine bypassed: both diffs were present; only the
  // marker one remains.
  'data-table': {
    oracles: ['snap', 'three-point'],
    reason:
      'Row hydration rewrites each forwarded cell text with textContent, dropping the <!--bf:^sN--> slot markers SSR emitted; the text itself is unchanged.',
    limitation: 'loop-row-child-text-children-markers-dropped',
  },
  // Registry limitation `ref-callback-portal-content-inline-at-ssr`
  // (direction corrected 2026-09-18 — `assertSnapshotsAgree` reports
  // Received = SSR, Expected = hydrated): SSR renders the overlay/content
  // subtree INLINE at its source position with no `bf-po`; the hydrate-time
  // `ref` callback's `createPortal` then moves it to the end of
  // `document.body` and stamps `bf-po`. So the marker is not "lost" after
  // hydration — it is ADDED, together with the relocation, because a `ref`
  // callback never runs at SSR and no adapter places the subtree at its
  // portal destination server-side.
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
    reason:
      'SSR renders the dialog overlay/content inline inside the component root with no bf-po; hydration\'s createPortal moves it to the end of document.body and stamps bf-po="DialogBasicDemo_test_s1".',
    limitation: 'ref-callback-portal-content-inline-at-ssr',
  },
  'dropdown-menu': {
    oracles: ['snap', 'three-point'],
    reason:
      'SSR renders the menu content inline with no bf-po; hydration relocates it to document.body and stamps bf-po="DropdownMenuCheckboxDemo_test_s5" — same shape as dialog.',
    limitation: 'ref-callback-portal-content-inline-at-ssr',
  },
  popover: {
    oracles: ['snap', 'three-point'],
    reason:
      'SSR renders the popover content inline with no bf-po; hydration relocates it to document.body and stamps bf-po="PopoverBasicDemo_test_s1" — same shape as dialog.',
    limitation: 'ref-callback-portal-content-inline-at-ssr',
  },
  portal: {
    oracles: ['snap', 'three-point'],
    reason:
      'SSR renders the overlay and content divs inline with no bf-po; hydration relocates both to document.body and stamps bf-po="PortalExample_test" — same shape as dialog (this fixture IS the portal primitive demo).',
    limitation: 'ref-callback-portal-content-inline-at-ssr',
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
