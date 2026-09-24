/**
 * Mutant quarantine ledger (#2481 step 2, "mutation sweep v1").
 *
 * `mutation.playwright.ts` runs the same three oracles `oracle.playwright.ts`
 * runs against the frozen corpus (`oracle-core.ts`), but against every
 * `status: 'ok'` mutant `scripts/mutation-generate.ts` produced. A first
 * sweep surfaces real divergences a mutation exposes that the base fixture
 * never did — fixing them is out of scope for standing the sweep up.
 *
 * Every `[fixtureId, mutationId, oracle]` triple known to fail is listed
 * here instead of skipped outright, mirroring `oracle-quarantine.ts` (see
 * that file's docstring for the rationale): a bare skip would go silently
 * stale the moment a fix lands, so `mutation.playwright.ts` instead asserts
 * each quarantined triple is STILL failing — a triple that starts passing
 * fails its rot check with a "stale — delete the entry" message.
 *
 * A triple whose (fixtureId, oracle) pair is ALREADY quarantined in
 * `oracle-quarantine.ts` for the BASE fixture is skipped entirely by
 * `mutation.playwright.ts` before it ever reaches this ledger — that oracle
 * is known-broken on the unmutated component already, so a mutant
 * reproducing the identical failure is not a new finding; re-reporting it
 * here would just be noise (and, more importantly, quarantine rot-checking
 * two ledgers for the same underlying bug would fight over which one gets
 * to go stale first the day it's fixed).
 *
 * `issue` starts undefined for freshly-quarantined triples; the person
 * triaging the first-run inventory fills it in once a `known-limitation`
 * issue exists (some rows may share one issue with each other or with an
 * `oracle-quarantine.ts` entry that covers the same root cause).
 */

import type { OracleKind } from './oracle-quarantine'

export interface MutationQuarantineEntry {
  fixtureId: string
  mutationId: string
  oracle: OracleKind
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /**
   * Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`,
   * kind `silent`). A mutated fixture is not the entry's own reproduction
   * (the entry lists the unmutated fixture that shows the same divergence
   * as written), so the join test checks only that the id exists.
   */
  limitation?: string
  /** Legacy tracking-issue URL, for rows not yet migrated to a registry limitation. */
  issue?: string
}

function key(fixtureId: string, mutationId: string, oracle: OracleKind): string {
  return `${fixtureId}::${mutationId}::${oracle}`
}

// Shared reason strings — several fixtures fail the same oracle from what
// is very likely one underlying mechanism (see each group's comment). The
// mechanism is described to the depth actually confirmed by inspecting a
// representative diff in the group; fixtures not individually traced are
// flagged as "consistent with" rather than confirmed, honestly.

const ENTRIES: readonly MutationQuarantineEntry[] = [
  // --- G1 (fixed, #2721) --------------------------------------------------
  // fragment-wrap hydration dropping loop/dynamic children — was
  // `hydrateCommentScope` (hydrate.ts) reading a fragment root's props via
  // `parsed[name] ?? {}`, a namespaced-JSON shape no emitter ever produces
  // (`wrapWithScopeComment`, hono-adapter.ts, emits the flat object
  // directly). Every root fragment scope with props hydrated against `{}` —
  // for `toggle-shared` that emptied `toggleItems`, so `mapArray`'s
  // "client has fewer items than SSR rendered" cleanup removed all 3 SSR
  // rows. Fixed: read the parsed JSON directly, matching
  // `hydrateElementScope`'s equivalent `bf-p` read. input /
  // nested-cond-toggle-list / text-escape / textarea / todo-app-ssr
  // graduated in full; toggle-shared graduated for `idempotence` only —
  // its `snap`/`three-point` triples hit a SEPARATE, narrower gap this fix
  // unmasked (see G1b below).

  // --- G1b (fixed, #2732 / #2733) ------------------------------------------
  // A fragment-wrapped keyed loop item's root got no `data-key` in its SSR
  // markup (`IRElement.carriesDataKey` now marks the fragment's own first
  // element, jsx-to-ir.ts) and `mapArray`'s row bookkeeping had nowhere to
  // carry the item's `<!--bf-scope:-->` boundary comments (`ItemScope.
  // scopeComments`, map-array.ts). Both graduated; see
  // `fragment-root-keyed-loop-row` in the shared JSX fixture corpus for the
  // regression coverage.

  // --- G2 / G2b (fixed, #2722) --------------------------------------------
  // fragment-wrap disrupting `createComponent()`'s (CSR-mount, no SSR)
  // root scope-id — `materializeComponent` (component.ts) treated EVERY
  // `comment: true` def as the #2649 "root is a child call" shape (leave
  // `scopeId` null, the child's own markup already carries one) even for a
  // genuine fragment root, whose markup carries NO scope id anywhere.
  // Null `scopeId` skipped `_parentScopeId` threading, so every nested
  // `renderChild()` fell back to a random un-prefixed id (#1627's
  // fallback) instead of the parent-derived one SSR/hydrate use — visible
  // as a missing root `bf-s` pre-interaction and as `Select_*` vs
  // `SelectBasicDemo_*` naming post-interaction. Fixed via a new
  // `ComponentDef.fragmentRoot` flag (compiler: `emit-registration.ts`'s
  // `isFragmentRoot`, distinct from the `root.type === 'component'` shape)
  // that makes `materializeComponent` generate a real scope id and its own
  // `<!--bf-scope:-->` boundary comments — `wrapWithScopeComment`'s CSR
  // mirror — instead of leaving both null, PLUS the matching fix in
  // `renderChild()` (same file) for a fragment-root child rendered INLINE
  // by its parent's own template (as opposed to a fresh top-level
  // `createComponent()` mount) — `renderChild` unconditionally spliced
  // `bf-s` into the child's markup with no `fragmentRoot` awareness at all
  // (found via `reactive-props`/`props-reactivity-comparison`'s
  // `ReactiveChild`, itself independently fragment-wrapped).
  // tooltip / select / radio-group / data-table / pagination / tag-cloud /
  // todo-app / textarea-native-shared / branch-root-prop-attr /
  // props-reactivity-comparison / reactive-props graduated in full.
  // button / conditional-return-button / conditional-return-link / kbd were
  // never quarantined for `snap` (SSR ≡ hydrated only — no CSR-mount leg
  // involved, so this bug never touched it); their `three-point`/
  // `idempotence` entries stay quarantined — a SEPARATE, conditional-
  // return-specific gap this fix does not reach (see G2c below). `select`'s
  // `idempotence` triple graduated
  // despite one observed failure: reproduced the scope-naming fix working
  // correctly (`bf-s` values matched byte-for-byte between legs) with the
  // only diff being a Radix `<Popover>`-style floating-position `style`
  // attribute (`top`/`--radix-select-content-available-height`) that
  // depends on viewport height at render time — confirmed flaky, not a
  // fragment-wrap regression, by rerunning in isolation (3/3 pass) vs. in
  // the full parallel suite (1 failure observed). Since root-caused (#2745)
  // to Playwright's scroll-into-view racing the page's async `scroll`
  // event and fixed in `oracle-core.ts`'s `settleScrollBeforeAction`.

  // --- G2c (fixed, #3063) ---------------------------------------------------
  // `fragment-wrap` applied to a conditional-return component
  // (`button` / `conditional-return-button` / `conditional-return-link` /
  // `kbd`) independently wraps ONE branch in a fragment, leaving the other
  // untouched — the exact shape `fragment-wrapped-conditional-return-branch-scope`
  // names. #3063 made that shape a loud BF029 compile-time refusal instead
  // of a silent CSR/hydration divergence: `scripts/mutation-generate.ts`
  // probes each mutant before generating its snapshot, and a refusal is a
  // PASS on its own (never reaches the oracle), so these four fixtures'
  // `fragment-wrap` mutants no longer produce a `status: 'ok'` manifest
  // entry for `mutation.playwright.ts` to even run against — the rows that
  // used to quarantine their oracle failures are gone rather than graduated
  // in place.

  // --- G3 (fixed, #2723) --------------------------------------------------
  // The issue body's original theory (CSR "build from scratch" assuming a
  // component body's leading statements are the destructure/signal
  // declarations it replays) was wrong — corrected in the issue's own
  // comment before the fix landed. The actual defects, both in Phase 2
  // (`ir-to-client-js`, which never re-derives through a local-const chain
  // the way Phase 1's `isPropsReference`/`isSignalOrMemoReference` already
  // do against `ctx.patterns.constants`):
  //   1. `needsEffectWrapper` (`reactivity.ts`) missed a prop reference
  //      reached only through a `const x__alias = x` hop, so the
  //      attribute's `createEffect` was never emitted — and when that
  //      effect was `init`'s only content, the whole function (and the
  //      `$`/`createEffect`/`applyRestAttrs` imports with it) collapsed to
  //      `function initX() {}`.
  //   2. Independently, the REST/whole-props spread source name check
  //      (`collect-elements.ts`'s `applyRestAttrs` registration,
  //      `html-template.ts`'s `spreadAttrs({...})` merge filter) compared
  //      the spread expression against `ctx.restPropsName` /
  //      `ctx.propsObjectName` by exact string equality — `alias-props`
  //      aliases the rest parameter too (`const props__alias = props`),
  //      so a real `{...props}` forward stopped being recognised as one.
  // Fixed via `resolveRestSpreadOrigin`/`resolveRestSpreadNames`
  // (`prop-handling.ts`) for (2) and a local-constant recursion in
  // `needsEffectWrapper` for (1) — both walk `ctx.localConstants` the same
  // way Phase 1 already does, not a new tracking structure (`BindingScope`
  // is loop/callback scope resolution and has no bearing on a component-
  // body `const` aliasing a prop).
  // button / input / kbd / label / textarea graduated in full.
  // `reactive-props` still fails `three-point` — see G7 below, now #2737 —
  // a DIFFERENT divergence this fix does not reach.

  // --- G5/G7 graduated (#2737 fix, this PR) ----------------------------------
  // `rewritePropsObjectRef` (rewrite-props-object.ts) — already the correct
  // AST-based device for the INIT body — is now also what html-template.ts's
  // four template-builder `transformExpr`/`transformJs` closures call,
  // replacing each one's own `\bpropsObjectName\.` regex copy (and
  // csr-substitute.ts's now-deleted `applyPropsRewrite`, its CSR-path twin).
  // The regex form required the props name to be immediately followed by
  // `.`, so a PARENTHESISED receiver — `(props).label`, which is exactly
  // what constant-inlining produces for a local alias of the whole props
  // object (`const props__alias = props`) — silently kept the pre-rewrite
  // name instead of becoming `(_p).label`. Both rows below were this same
  // leak surfacing through the same fixture on two oracles; confirmed via
  // `mutation.playwright.ts`'s own rot-check (each now throws its "stale —
  // delete the entry" error instead of matching the quarantined failure):
  //   - G5 (reactive-props × alias-props × idempotence, no issue filed):
  //     the `.btn-parent-increment` timeout was `ReactiveChild`'s child
  //     template throwing on the bare `props` identifier before the
  //     click handler ever ran.
  //   - G7 (reactive-props × alias-props × three-point, #2737): the
  //     issue this fix directly targets — see its body for the full
  //     `(props).label` repro.
  // G4 (toggle-shared × alias-props × idempotence, #2724) did NOT graduate
  // here — it stayed quarantined for a separate reason below, until its own
  // fix.

  // --- G4 (fixed, #2724) ------------------------------------------------
  // Not the G5/G7 `(props).label` mechanism above, despite the shared
  // `alias-props` mutation: `toggleItems.map(...)` becoming
  // `toggleItems__alias.map(...)` made the loop's array look, to Phase 1's
  // `isArrayExprDirectPropRef` (jsx-to-ir.ts), like a local constant with
  // no prop/signal origin — it checked the array expression's AST shape
  // directly and never walked a `const x = y` alias hop the way its
  // siblings `isPropsReference`/`isSignalOrMemoReference` already did. The
  // loop was misclassified `isStaticArray: true` and compiled to the
  // static `qsaChildScopes` + `forEach` init path instead of `mapArray`.
  // That static path's `renderChild()` calls carry no `bf-h`/`bf-m`
  // scope-relationship attributes on a pure CSR mount (no existing SSR
  // markup to hydrate against), so the static init's `qsaChildScopes`
  // selector never matched there — the row's `ToggleItem` never got
  // `initChild`ed, so its own signal/click listener never wired up and the
  // csr-mount leg's clicks were silently no-ops. Fixed by having
  // `isArrayExprDirectPropRef` resolve a bare-identifier array expression
  // through its alias-hop chain via `resolveAliasOrigin` (`props-binding.ts`
  // — the same shared walker `forwardsCallerRestProps` already used for
  // the rest/props-spread alias case), recognizing each hop as a direct
  // prop binding either by name or by a `<propsObjName>.<key>` member
  // access read off the constant's structured `.parsed` shape.
  //
  // The static `qsaChildScopes` init path's own CSR-mount gap for a
  // GENUINELY static array of stateful child components (one that this fix
  // does not route away from that path) is a separate, still-open defect —
  // filed independently as #2833, not part of this graduation.

]

export const MUTATION_QUARANTINE: ReadonlyMap<string, MutationQuarantineEntry> = new Map(
  ENTRIES.map(e => [key(e.fixtureId, e.mutationId, e.oracle), e]),
)

export function mutationQuarantineEntry(fixtureId: string, mutationId: string, oracle: OracleKind): MutationQuarantineEntry | undefined {
  return MUTATION_QUARANTINE.get(key(fixtureId, mutationId, oracle))
}
