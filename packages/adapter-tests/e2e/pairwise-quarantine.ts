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
 * Populated 2026-08-28 from a full sweep at head `1d1a8e8d7` (111 failing
 * `[caseId, oracle]` pairs). Triaged into nine `known-limitation` issues
 * (#2749–#2751, #2753–#2757, plus the pre-existing #2714) by reading each
 * failure's actual `Expected`/`Received` diff (or, for the browser-console
 * cases, a targeted diagnostic script), not by assuming the issue-mapping
 * table a human handed down in advance — see each `reason` for the
 * specific evidence. `assertSnapshotsAgree` (oracle-core.ts) runs the
 * structural-HTML `toBe` check before the DOM-state `toEqual` check inside
 * ONE call, so a case failing BOTH throws on the HTML check and never
 * reaches the DOM-state one — several entries below name a second,
 * currently-masked defect for exactly this reason (search "fires first").
 * Two rows (`early-return` + `controlled-select`, `state-prop-shadowing-
 * signal`, oracles `snap`/`three-point`) measured as a genuinely distinct,
 * un-diagnosed divergence (a controlled `<select>` whose value matches no
 * `<option>` resolves `selectedIndex`/`value` differently between SSR's
 * browser-default behavior and the client's explicit property write) that
 * does not fit any of the nine issues — deliberately left OUT of this
 * ledger rather than forced into the nearest bucket; that pair is still
 * red and reported separately as unquarantined.
 *
 * 2026-08-29 graduation: BF044 (`checkBareSignalOrMemoIdentifier`,
 * `jsx-to-ir.ts`) widened from a top-level-identifier-only check to a
 * recursive descent over rendered positions (a DOM element's attribute
 * value, a JSX text child — never a component prop, where an uncalled
 * getter is this codebase's deliberate Context-Provider idiom). Every
 * `state: getter-elided-signal` case this ledger quarantined under
 * #2755 (22 rows) and #2751 (8 rows) now gets refused at compile time
 * instead of silently misbehaving, so those cases dropped out of the
 * pairwise generator's `ok` set entirely and their entries were
 * deleted as stale — not "now passes this oracle" (the rot-check's own
 * phrasing), but "no longer exists to run the oracle against at all".
 * The SAME getter-elided-signal cases also carried #2753/#2754/#2714
 * entries (6/4/2 rows) for orthogonal defects (row `data-key`, a
 * dropped `data-pw-event` prop, a missing `data-mounted` under SSR) —
 * those went stale for the identical reason and were deleted too; the
 * issues themselves stay open for whichever `ok` cases still exercise
 * their mechanism. 97 pairwise cases, ok 85→62, refused 12→35 (all 23
 * newly-refused cases move BF023/BF044-refused, 0 broken throughout).
 *
 * 2026-08-29 graduation, #2756 and #2754. #2756: the client-side row /
 * branch builders (`irToHtmlTemplate` and its composite-row twin
 * `irToPlaceholderTemplate`, html-template.ts) now honour `attr.clientOnly`
 * the way the component and CSR template paths always did, so a rebuilt
 * `<textarea>`/`<select>` row no longer carries a literal `value` attribute
 * a hydration-reused row never had — 5 of the 6 rows graduated. The one
 * that stays is the INPUT sub-mechanism, the opposite direction (SSR bakes
 * `value="0"`, the client sets only the property, so a hydration-reused
 * `<input>` keeps an attribute a freshly built one never has); the issue
 * stays open for it. #2754: a `{...props}` forward now makes its host
 * element need a slot id, and `needsClientJs` counts the rest-attrs
 * application, so `applyRestAttrs` is emitted and addressable — all 16
 * rows graduated. The 6 `structure-child-component` idempotence rows that
 * still fail were RE-FILED under #2757, not kept: measured directly, both
 * legs now carry `data-pw-event="1"` and the click lands, and the only
 * remaining difference is the csr-mount scope-id prefix those cases'
 * `three-point` rows already record. 187 pairwise tests, 15 quarantined
 * rows deleted (10 under #2754, 5 under #2756) and 6 re-filed from
 * #2754 to #2757 — no #2754 row remains.
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

const ENTRIES: readonly PairwiseQuarantineEntry[] = [

  // --- #2753: fully graduated, no entries remain -----------------------
  // 系統2 root-cause fix (`IRElement.keyAttr`, see jsx-to-ir.ts): both
  // shapes graduated. 18 of the 24 rows went stale (the case now agrees on
  // the row-key attribute for every oracle exercised) and were deleted.
  // The 5 rows below survive the sweep but NOT for #2753 — each was
  // re-measured by un-quarantining it and reading the raw diff, and each
  // is re-attributed to the issue that actually keeps it red. Two distinct
  // mechanisms, both of which `assertSnapshotsAgree` could not reach while
  // the `data-key` difference sorted first (structural HTML compares once,
  // first-diff-wins):
  //   - 4 rows (2 caseIds x snap/three-point): the residue is #2714's
  //     ref-callback `data-mounted` stamp, which SSR cannot produce. The
  //     unkeyed `fragment-row-loop` now emits NO row-key attribute in
  //     either leg, which is the correct output for an unkeyed loop.
  //   - 1 row (three-point only): a second divergence that was genuinely
  //     hidden until now — #2750. A sixth row sat here for #2756 and
  //     graduated with that fix (2026-08-29).
  // Nothing here is filed under #2753 any more; a rot-check that still
  // found #2753 rows would be reading a stale ledger, which is the exact
  // failure this file exists to prevent.
  { caseId: "state-memo__structure-fragment-row-loop__binding-controlled-select__event-ref-callback__callback-flatmap-callback", oracle: "snap", reason: "#2753's own divergence is fixed (this unkeyed `fragment-row-loop` now emits no row-key attribute in EITHER leg, which is the correct output for an unkeyed loop). What remains is the #2714 half alone, measured directly by un-quarantining this row: the sole structural difference is `data-mounted=\"0\"`, present in the hydrated leg and absent from SSR, because a ref-callback mount effect cannot run at SSR. No `data-key` appears in either leg.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-memo__structure-fragment-row-loop__binding-controlled-select__event-ref-callback__callback-flatmap-callback", oracle: "three-point", reason: "#2753's own divergence is fixed (this unkeyed `fragment-row-loop` now emits no row-key attribute in EITHER leg, which is the correct output for an unkeyed loop). What remains is the #2714 half alone, measured directly by un-quarantining this row: the sole structural difference is `data-mounted=\"0\"`, present in the hydrated leg and absent from SSR, because a ref-callback mount effect cannot run at SSR. No `data-key` appears in either leg.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-signal__structure-fragment-row-loop__binding-class__event-ref-callback__callback-filter-predicate", oracle: "snap", reason: "#2753's own divergence is fixed (this unkeyed `fragment-row-loop` now emits no row-key attribute in EITHER leg, which is the correct output for an unkeyed loop). What remains is the #2714 half alone, measured directly by un-quarantining this row: the sole structural difference is `data-mounted=\"0\"`, present in the hydrated leg and absent from SSR, because a ref-callback mount effect cannot run at SSR. No `data-key` appears in either leg.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-signal__structure-fragment-row-loop__binding-class__event-ref-callback__callback-filter-predicate", oracle: "three-point", reason: "#2753's own divergence is fixed (this unkeyed `fragment-row-loop` now emits no row-key attribute in EITHER leg, which is the correct output for an unkeyed loop). What remains is the #2714 half alone, measured directly by un-quarantining this row: the sole structural difference is `data-mounted=\"0\"`, present in the hydrated leg and absent from SSR, because a ref-callback mount effect cannot run at SSR. No `data-key` appears in either leg.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-signal__structure-nested-loop-depth-2__binding-boolean-attr__event-ref-callback__callback-function-reference", oracle: "three-point", reason: "#2753's own divergence is fixed (both legs now agree on `data-key`/`data-key-1`) — this row stays red for an UNRELATED, previously-masked reason `assertSnapshotsAgree`'s first-diff-wins structural compare never reached until now: this case's nested-loop `ref` const (`handleMount`) has its call site emitted but its declaration dropped from the module (#2750), so csr-mount throws `ReferenceError: handleMount is not defined` before rendering anything (hydrated: full markup; csr-mount: empty string) — confirmed directly (page console).", issue: "https://github.com/piconic-ai/barefootjs/issues/2750" },

  // --- #2714 ---------------------------------------------------------
  { caseId: "state-memo__structure-signal-array-loop__binding-controlled-input__event-ref-callback__callback-filter-predicate", oracle: "snap", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-memo__structure-signal-array-loop__binding-controlled-input__event-ref-callback__callback-filter-predicate", oracle: "three-point", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop-shadowing-signal__structure-fragment__binding-style__event-ref-callback__callback-inline-arrow", oracle: "snap", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop-shadowing-signal__structure-fragment__binding-style__event-ref-callback__callback-inline-arrow", oracle: "three-point", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop-shadowing-signal__structure-static-array-loop__binding-class__event-ref-callback__callback-flatmap-callback", oracle: "snap", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop-shadowing-signal__structure-static-array-loop__binding-class__event-ref-callback__callback-flatmap-callback", oracle: "three-point", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop__structure-keyed-loop__binding-attr__event-ref-callback__callback-sort-comparator", oracle: "snap", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop__structure-keyed-loop__binding-attr__event-ref-callback__callback-sort-comparator", oracle: "three-point", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop__structure-preamble-builder-body__binding-text__event-ref-callback__callback-flatmap-callback", oracle: "snap", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },
  { caseId: "state-prop__structure-preamble-builder-body__binding-text__event-ref-callback__callback-flatmap-callback", oracle: "three-point", reason: "A `ref` callback's mount effect (`el.setAttribute('data-mounted', ...)`) never runs during SSR — same root cause as the existing accordion/radio-group/command entries in oracle-quarantine.ts (#2714): SSR bakes markup with no `data-mounted` attribute at all, and hydration's first effect pass adds it, so the SSR-vs-hydrated structural comparison sees an attribute appear that SSR never emitted.", issue: "https://github.com/piconic-ai/barefootjs/issues/2714" },

  // --- #2756 ---------------------------------------------------------
  { caseId: "state-memo__structure-signal-array-loop__binding-controlled-input__event-ref-callback__callback-filter-predicate", oracle: "idempotence", reason: "After the filter action shrinks the row count, a hydration-reused `<input>` row and a csr-mount-rebuilt row disagree on whether the controlled `value` attribute survives as a literal DOM attribute (#2756, input sub-mechanism) — measured directly: the csr-mount-actions leg carries `value=\"0\"`, the hydrated-actions leg does not.", issue: "https://github.com/piconic-ai/barefootjs/issues/2756" },

  // --- #2749 ---------------------------------------------------------
  { caseId: "state-memo__structure-child-component__binding-controlled-input__event-ref-callback__callback-inline-arrow", oracle: "snap", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },
  { caseId: "state-memo__structure-child-component__binding-controlled-input__event-ref-callback__callback-inline-arrow", oracle: "three-point", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },
  { caseId: "state-prop-shadowing-signal__structure-child-component__binding-text__event-ref-callback__callback-function-reference", oracle: "snap", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },
  { caseId: "state-prop-shadowing-signal__structure-child-component__binding-text__event-ref-callback__callback-function-reference", oracle: "three-point", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },
  { caseId: "state-signal__structure-child-component__binding-class__event-ref-callback__callback-function-reference", oracle: "snap", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },
  { caseId: "state-signal__structure-child-component__binding-class__event-ref-callback__callback-function-reference", oracle: "three-point", reason: "Hydration stringifies this child-component call-site `ref` callback's source text into a literal `ref=\"...\"` DOM attribute instead of invoking it (#2749) — function source leaks into the markup and the callback never runs. This already fails the structural-HTML SSR-vs-hydrated comparison, so three-point's second (hydrated-vs-csr-mount) comparison is never reached. #2749 is the issue that must be fixed for THIS row to pass. (This case also used to drop the caller-supplied `data-pw-event` prop under csr-mount; that half — #2754 — is fixed, and its idempotence row is now filed under #2757.)", issue: "https://github.com/piconic-ai/barefootjs/issues/2749" },

  // --- #2757 ---------------------------------------------------------
  { caseId: "state-memo__structure-child-component__binding-controlled-input__event-ref-callback__callback-inline-arrow", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-memo__structure-child-component__binding-controlled-textarea__event-direct-handler__callback-inline-arrow", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-prop-shadowing-signal__structure-child-component__binding-text__event-ref-callback__callback-function-reference", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-prop__structure-child-component__binding-attr__event-handler-reading-outer-signal__callback-inline-arrow", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-signal__structure-child-component__binding-class__event-ref-callback__callback-function-reference", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-signal__structure-child-component__binding-style__event-direct-handler__callback-inline-arrow", oracle: "idempotence", reason: "Idempotence replays the click against both legs and compares the resulting DOM. The click itself now lands — #2754's caller-prop drop is fixed, and `data-pw-event=\"1\"` is present in BOTH legs — so what is left is the SAME scope-id prefix divergence this case's `three-point` row records: under pure CSR mount the nested `renderChild` never receives `_parentScopeId`, so the child's root reads `bf-s=\"PairwiseCase_*_sN\"` where SSR and hydration both produce `bf-s=\"PairwiseRow_*_sN\"` (#2757). Measured directly: that one attribute is the only difference between the two snapshots.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-memo__structure-child-component__binding-controlled-textarea__event-direct-handler__callback-inline-arrow", oracle: "three-point", reason: "This top-level `structure: child-component` case never threads `_parentScopeId` into its nested `renderChild` under pure CSR mount, so the child invents its own `bf-s` prefix from its own display name (`PairwiseRow_...`) instead of the caller-derived prefix SSR and hydration both use (#2757) — SSR and hydration agree; only csr-mount's scope-id prefix diverges. The same row also drops the caller-supplied `data-pw-event` prop under csr-mount (#2754) — separable, and not the subject of this entry.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-prop__structure-child-component__binding-attr__event-handler-reading-outer-signal__callback-inline-arrow", oracle: "three-point", reason: "This top-level `structure: child-component` case never threads `_parentScopeId` into its nested `renderChild` under pure CSR mount, so the child invents its own `bf-s` prefix from its own display name (`PairwiseRow_...`) instead of the caller-derived prefix SSR and hydration both use (#2757) — SSR and hydration agree; only csr-mount's scope-id prefix diverges. The same row also drops the caller-supplied `data-pw-event` prop under csr-mount (#2754) — separable, and not the subject of this entry.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },
  { caseId: "state-signal__structure-child-component__binding-style__event-direct-handler__callback-inline-arrow", oracle: "three-point", reason: "This top-level `structure: child-component` case never threads `_parentScopeId` into its nested `renderChild` under pure CSR mount, so the child invents its own `bf-s` prefix from its own display name (`PairwiseRow_...`) instead of the caller-derived prefix SSR and hydration both use (#2757) — SSR and hydration agree; only csr-mount's scope-id prefix diverges. The same row also drops the caller-supplied `data-pw-event` prop under csr-mount (#2754) — separable, and not the subject of this entry.", issue: "https://github.com/piconic-ai/barefootjs/issues/2757" },

  // --- #2750 ---------------------------------------------------------
  { caseId: "state-signal__structure-nested-loop-depth-2__binding-boolean-attr__event-ref-callback__callback-function-reference", oracle: "idempotence", reason: "Idempotence replays a click against the csr-mount leg; this case's nested-loop `ref` const (`handleMount`) has its call site emitted but its declaration dropped from the module (#2750), so both hydrate and csr-mount throw `ReferenceError: handleMount is not defined` — confirmed directly (page console on both legs). Only csr-mount actually loses its click target though (count=0): the hydrate leg's rows are still built by the template pass before the ref effect throws, so [data-pw-event] survives there and the click succeeds.", issue: "https://github.com/piconic-ai/barefootjs/issues/2750" },

  // --- #2758 ---------------------------------------------------------
  { caseId: "state-prop-shadowing-signal__structure-early-return__binding-controlled-select__event-direct-handler__callback-function-reference", oracle: "snap", reason: "SSR emits the select with no `selected` attribute because the bound value (prop `val: 7`) matches no option, so the browser defaults to the first option; hydration then assigns `.value` explicitly, which for an out-of-range value yields selectedIndex -1 and an empty value. Measured pre = selectedIndex 0 / value 0, post = selectedIndex -1 / value empty. Independent of the harness `_p` handling: `bf-p` IS present in the served DOM, and `String(String(7))` and `String(String(undefined))` both match no option, so the divergence is identical either way (#2758).", issue: "https://github.com/piconic-ai/barefootjs/issues/2758" },
  { caseId: "state-prop-shadowing-signal__structure-early-return__binding-controlled-select__event-direct-handler__callback-function-reference", oracle: "three-point", reason: "SSR emits the select with no `selected` attribute because the bound value (prop `val: 7`) matches no option, so the browser defaults to the first option; hydration then assigns `.value` explicitly, which for an out-of-range value yields selectedIndex -1 and an empty value. Measured pre = selectedIndex 0 / value 0, post = selectedIndex -1 / value empty. Independent of the harness `_p` handling: `bf-p` IS present in the served DOM, and `String(String(7))` and `String(String(undefined))` both match no option, so the divergence is identical either way (#2758).", issue: "https://github.com/piconic-ai/barefootjs/issues/2758" },
]

export const PAIRWISE_QUARANTINE: ReadonlyMap<string, PairwiseQuarantineEntry> = new Map(
  ENTRIES.map(e => [key(e.caseId, e.oracle), e]),
)

export function pairwiseQuarantineEntry(caseId: string, oracle: OracleKind): PairwiseQuarantineEntry | undefined {
  return PAIRWISE_QUARANTINE.get(key(caseId, oracle))
}
