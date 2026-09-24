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
 * (2026-09-18: that pair — by then 7 cases × 2 oracles, after #2852 fixed
 * the markup half — is now quarantined under the registry entry
 * `select-out-of-range-selected-index`; see the #2758 note in the table.)
 *
 * 2026-09-18 migration: every row that still pointed at a tracking issue
 * (all 142 under #2714, the ref-callback / mount-effect attribute gap)
 * was moved to cite the registry entry `ref-effect-attr-state-ssr`
 * instead. `limitation` is therefore required on every row and the legacy
 * `issue` field is gone from this ledger. Those 142 rows have since
 * graduated (BF063 + the composer rendering `data-mounted`; see the note
 * in the table).
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
 *
 * 2026-08-29 graduation, #2749 and #2757. #2749: `collectReactiveChildProps`
 * (collect-elements.ts) now reads `classifyDOMProp` — the shared classifier
 * `applyRestAttrs` already used — instead of a hand-rolled `on[A-Z]` test, so
 * a `ref` on a child-component call site is no longer mirrored as
 * `setAttribute('ref', String(<fn source>))` by the emitted `init`. All 6 rows
 * were RE-FILED to #2714, not deleted: with the attribute leak gone the
 * callback runs, and what remains is that a `ref` cannot run during SSR at all
 * — the hydrated leg carries the `data-mounted` it sets and the SSR leg does
 * not, which is #2714's capability gap, measured directly on all three case
 * ids. #2757: `materializeComponent` (component.ts) now derives a scope id for
 * a top-level root-is-a-child-call wrapper purely to thread into
 * `_parentScopeId`, so the nested `renderChild` derives the child's `bf-s`
 * from the WRAPPER (`PairwiseCase_*_sN`) instead of from its own display name
 * (`PairwiseRow_*_sN`) — all 9 rows went stale and were deleted. 187 pairwise
 * tests, 9 rows deleted and 6 re-filed from #2749 to #2714 — no #2749 or
 * #2757 row remains.
 *
 * Correction while re-reading the rows this round removed: the six #2757
 * `idempotence` reasons stated the divergence backwards ("csr-mount reads
 * `PairwiseCase_*_sN` where SSR and hydration both produce
 * `PairwiseRow_*_sN`"). The `three-point` reasons, and #2757's own body, had
 * it right — csr-mount is the leg that names the child after itself. The
 * rows are deleted, so the wrong text goes with them; noted here so the
 * pattern (a reason transcribed with Expected/Received swapped, the same trap
 * #2714's own correction records) stays visible.
 *
 * 2026-09-02 graduation, #2756 fully closed. The INPUT sub-mechanism left
 * open by the 2026-08-29 graduation is fixed: `buildLoopSkeletonTemplate`'s
 * hoisted shared-`<template>` fast path now refuses to hoist a row carrying
 * a non-`clientOnly` property-only bind (`value`/`checked`, per the shared
 * `classifyDOMProp` classifier), falling back to the per-row interpolated
 * template that already bakes the attribute correctly, instead of omitting
 * it and trusting a `createEffect` that (by design, #2716) only ever writes
 * the DOM property, never `setAttribute`. All 21 quarantined `[caseId,
 * oracle]` rows under #2756 (the 1 surviving row from 2026-08-29, plus 10
 * newly-triaged cases × idempotence/three-point) re-measured as passing —
 * confirmed directly via `bunx playwright test e2e/pairwise.playwright.ts
 * -g controlled-input`, which also confirmed no row silently traded this
 * divergence for a different, previously-masked one (every non-quarantined
 * oracle for the same case ids passes too). All 21 rows deleted; #2756 has
 * no remaining rows in this ledger.
 */

import type { OracleKind } from './oracle-quarantine'

export interface PairwiseQuarantineEntry {
  caseId: string
  oracle: OracleKind
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /**
   * Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`,
   * kind `silent`). A generated pairwise case is not a corpus fixture, so
   * the join test checks only that the id exists.
   */
  limitation: string
}

function key(caseId: string, oracle: OracleKind): string {
  return `${caseId}::${oracle}`
}

const ENTRIES: readonly PairwiseQuarantineEntry[] = [
  // --- #2753: fully graduated, no entries remain -----------------------
  // 系統2 root-cause fix (`IRElement.keyAttr`, see jsx-to-ir.ts): both
  // shapes graduated. 18 of the 24 rows went stale (the case now agrees on
  // the row-key attribute for every oracle exercised) and were deleted.
  // The rows that survived that sweep were re-attributed to the mechanism
  // that actually kept them red (#2714's ref-callback `data-mounted` stamp,
  // #2750, #2756) and have since graduated with those fixes — see the
  // `ref-effect-attr-state-ssr` note below. Nothing here is filed under
  // #2753 any more; a rot-check that still found #2753 rows would be
  // reading a stale ledger, which is the exact failure this file exists to
  // prevent.

  // --- ref-effect-attr-state-ssr (#2714): graduated — all 142 rows ----
  // Every `event-ref-callback` case composed a `ref` that stamps
  // `data-mounted` via `setAttribute` on an element whose JSX never
  // rendered it, so SSR could never carry it and hydration always added
  // it. That shape is now a loud BF063 compile-time refusal, and the
  // composer (`pairwise/compose.ts`, `ref-callback`) renders
  // `data-mounted={String(<state>)}` beside the `ref`, so SSR already
  // carries the value the ref writes on mount — the axis keeps exercising
  // a real mount-time `ref` write in every structure (child-component and
  // component-row-root-loop included, where it travels through the
  // child's `{...rest}` spread) with no SSR/hydration divergence. All 142
  // rows (71 cases x snap/three-point) went stale and were deleted.

  // --- #2757: fully graduated, no entries remain -----------------------
  // A top-level root-is-a-child-call component (`comment: true`,
  // `fragmentRoot: false`) now derives a scope id purely for threading into
  // `_parentScopeId` (`materializeComponent`, component.ts), so the nested
  // `renderChild` names the child after the WRAPPER — matching SSR and
  // hydration — instead of after itself. All 9 rows went stale and were
  // deleted.

  // --- select-out-of-range-selected-index: graduated (#3066) --------------
  // Every `prop-shadowing-signal × controlled-select` out-of-range row
  // (14 rows) is fixed by the same tag-gated `selectedIndex = 0` fallback
  // in `emitValueUpdateStatements` (`emit-reactive.ts`) that graduated the
  // dedicated `select-out-of-range-hydration` oracle-quarantine row and
  // its registry entry — one shared codegen function every
  // `<select value={…}>` compiles through, regardless of the surrounding
  // structure these rows vary (early-return, nested loops, conditionals,
  // child components, fragment rows).

  // --- #2750: fully graduated (2026-09-18) --------------------------------
  // #2799 restored the nested-loop `ref` const declaration, so no leg throws
  // any more; the two `idempotence` rows went stale and were deleted, and the
  // two `three-point` rows were re-filed under #2714 with the diff they
  // showed then (`data-mounted="0"` after hydration, absent from SSR) —
  // since graduated with the rest of `ref-effect-attr-state-ssr` above.

  // --- #2758: graduated, residue graduated too (#3066) --------------------
  // `lowerFormControlValueSsr` (`jsx-to-ir.ts`) now injects a hidden
  // `disabled` placeholder `<option>` whenever a controlled single-selection
  // `<select>`'s options are statically enumerable, `selected` via the
  // negation of every real option's match condition ORed together. A value
  // matching no option now SSRs as "nothing selected" instead of the
  // browser's implicit first-option default. The MARKUP half is fixed and
  // pinned by `select-value-no-match-ssr` / `select-multiple-value-no-match-ssr`.
  // The LIVE-STATE half (the server has the placeholder selected while
  // hydration's `.value` assignment used to yield `selectedIndex` -1, the
  // same pair this file's header once described as "deliberately left
  // out") was tracked as the registry entry `select-out-of-range-selected-
  // index`; both it and the 14 `prop-shadowing-signal × controlled-select`
  // rows above are graduated now that the controlled-value effect falls
  // back to `selectedIndex = 0` on no match (see the section above).

  // --- #2481 t=3 sweep (variable-strength promotion, #2796/#2797) -----
  // Populated from the t=3 additionalCases browser-oracle sweep (every row
  // since graduated). All 156 failures it produced reduced to four
  // pre-existing mechanisms plus one newly filed one — none are a t=2-floor regression, each attributed by
  // reading the actual diff (or, where the symptom looked new, a targeted
  // headless-Chromium repro) rather than assumed from the axis combo alone.
  // A separate stale-`packages/client`-build artifact (39 cases crashing on
  // a missing `markupOrEmpty` export) inflated the raw sweep to 210 failures
  // before a rebuild dropped it to this real 156 — not entered here, since
  // it was never a product defect.

  // --- #2750 (nested-loop ref declaration dropped, 1 new case): graduated 2026-09-18, see the #2750 note above ---

  // --- #2797 (component-row-root-loop handler declaration dropped): fully graduated 2026-09-18 ---
  // #2801 emits the loop-row preamble on the component loop-plan variant, so
  // `handleRowClick` is declared before the `mapArray` callback references it;
  // all 4 rows (2 cases × idempotence/three-point) went stale and were deleted.
]

export const PAIRWISE_QUARANTINE: ReadonlyMap<string, PairwiseQuarantineEntry> = new Map(
  ENTRIES.map(e => [key(e.caseId, e.oracle), e]),
)

export function pairwiseQuarantineEntry(caseId: string, oracle: OracleKind): PairwiseQuarantineEntry | undefined {
  return PAIRWISE_QUARANTINE.get(key(caseId, oracle))
}
