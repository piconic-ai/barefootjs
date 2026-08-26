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
  /** `known-limitation` issue URL, filled in after triage. */
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

/** G1: fragment-wrap makes hydration DROP loop/dynamic children the SSR markup had. */
const FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN =
  'fragment-wrap wraps the component root in `<>...</>`; after hydration runs, loop-rendered/dynamic children present in the SSR markup are gone from the live DOM (pre-hydration capture has them, post-hydration does not) — the hydration walker appears to lose track of them once an extra Fragment level sits above the original root.'

/** G2: fragment-wrap disrupts `createComponent()`'s root scope-id (`bf-s`) stamping, visible pre-interaction. */
const FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION =
  "fragment-wrap wraps the component root in `<>...</>`; the csr-mount leg (`createComponent()`, no SSR) then produces a root missing its `bf-s` scope-id attribute entirely (confirmed on button/conditional-return-button/conditional-return-link/kbd/tooltip) — already visible before any interaction runs, so 'three-point' fails on its own."

/** G2b: same csr-mount scope-id disruption, but only exposed once a state-changing interaction patches the DOM. */
const FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION =
  "fragment-wrap wraps the component root in `<>...</>`; pre-interaction markup normalizes identically between the hydrated and csr-mount legs, but replaying the fixture's action steps exposes a divergence in scope-id-tied attributes/structure between the two — consistent with the same `createComponent()` root scope-id disruption confirmed directly on `select` (post-click, the hydrated leg reports the underlying `Select_*` primitive as the scope root while csr-mount reports the demo wrapper `SelectBasicDemo_*`) rather than a fresh, independent bug per fixture."

/** G3: alias-props makes `createComponent()`'s CSR-mount path render nothing at all. */
const ALIAS_PROPS_CSR_MOUNT_EMPTY =
  "alias-props inserts `const x__alias = x` hops before a component's original body statements; the csr-mount leg (`createComponent()`, no SSR) then renders a completely EMPTY root — confirmed directly (Button/Kbd/Label/Input/Textarea all render '' via csr-mount while SSR+hydration render the expected element correctly), consistent with the CSR-side 'build from scratch' codegen path assuming the destructure/signal declarations are the function body's leading statements."

const ENTRIES: readonly MutationQuarantineEntry[] = [
  // --- G1 -----------------------------------------------------------------
  { fixtureId: 'input', mutationId: 'fragment-wrap', oracle: 'snap', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'input', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'input', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'nested-cond-toggle-list', mutationId: 'fragment-wrap', oracle: 'snap', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'nested-cond-toggle-list', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  {
    fixtureId: 'nested-cond-toggle-list',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: `${FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN} Surfaces here as a click timeout — the action's target no longer exists once its container was dropped.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2721',
  },
  { fixtureId: 'text-escape', mutationId: 'fragment-wrap', oracle: 'snap', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'text-escape', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'text-escape', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'textarea', mutationId: 'fragment-wrap', oracle: 'snap', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'textarea', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'textarea', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'todo-app-ssr', mutationId: 'fragment-wrap', oracle: 'snap', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'todo-app-ssr', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  { fixtureId: 'todo-app-ssr', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  {
    fixtureId: 'toggle-shared',
    mutationId: 'fragment-wrap',
    oracle: 'snap',
    reason: `${FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN} Confirmed directly: pre-hydration shows all 3 ToggleItem rows, post-hydration shows only the <h3> heading.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2721',
  },
  { fixtureId: 'toggle-shared', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN, issue: 'https://github.com/piconic-ai/barefootjs/issues/2721' },
  {
    fixtureId: 'toggle-shared',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: `${FRAGMENT_WRAP_HYDRATION_DROPS_CHILDREN} Surfaces here as a click timeout on the second toggle item's button — its row no longer exists once hydration dropped the list.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2721',
  },

  // --- G2 -------------------------------------------------------------------
  { fixtureId: 'button', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'button', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  {
    fixtureId: 'conditional-return-button',
    mutationId: 'fragment-wrap',
    oracle: 'three-point',
    reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  {
    fixtureId: 'conditional-return-button',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  {
    fixtureId: 'conditional-return-link',
    mutationId: 'fragment-wrap',
    oracle: 'three-point',
    reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  {
    fixtureId: 'conditional-return-link',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  { fixtureId: 'kbd', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'tooltip', mutationId: 'fragment-wrap', oracle: 'three-point', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'tooltip', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_PRE_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },

  // --- G2b ------------------------------------------------------------------
  {
    fixtureId: 'select',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: `${FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION} This is the confirmed representative case.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  { fixtureId: 'radio-group', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'data-table', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'pagination', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'tag-cloud', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'todo-app', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  {
    fixtureId: 'props-reactivity-comparison',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: `${FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION} This fixture's snap/three-point oracles are already quarantined for a related-but-distinct expando-.value leak (oracle-quarantine.ts, issue 2716); idempotence is not covered by that entry, so this is tracked separately here.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },
  { fixtureId: 'textarea-native-shared', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  { fixtureId: 'branch-root-prop-attr', mutationId: 'fragment-wrap', oracle: 'idempotence', reason: FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION, issue: 'https://github.com/piconic-ai/barefootjs/issues/2722' },
  {
    fixtureId: 'reactive-props',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason: `${FRAGMENT_WRAP_CSR_MOUNT_SCOPE_ID_POST_INTERACTION} This fixture's snap/three-point oracles are already quarantined for a related-but-distinct expando-.value leak (oracle-quarantine.ts, issue 2716); idempotence is not covered by that entry, so this is tracked separately here.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2722',
  },

  // --- G3 ---------------------------------------------------------------
  { fixtureId: 'button', mutationId: 'alias-props', oracle: 'three-point', reason: ALIAS_PROPS_CSR_MOUNT_EMPTY, issue: 'https://github.com/piconic-ai/barefootjs/issues/2723' },
  {
    fixtureId: 'button',
    mutationId: 'alias-props',
    oracle: 'idempotence',
    reason: `${ALIAS_PROPS_CSR_MOUNT_EMPTY} Surfaces here as a click timeout — there is no <button> in the csr-mount DOM to click.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2723',
  },
  { fixtureId: 'input', mutationId: 'alias-props', oracle: 'three-point', reason: ALIAS_PROPS_CSR_MOUNT_EMPTY, issue: 'https://github.com/piconic-ai/barefootjs/issues/2723' },
  {
    fixtureId: 'input',
    mutationId: 'alias-props',
    oracle: 'idempotence',
    reason: `${ALIAS_PROPS_CSR_MOUNT_EMPTY} Surfaces here as a fill timeout — there is no <input> in the csr-mount DOM to fill.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2723',
  },
  { fixtureId: 'kbd', mutationId: 'alias-props', oracle: 'three-point', reason: ALIAS_PROPS_CSR_MOUNT_EMPTY, issue: 'https://github.com/piconic-ai/barefootjs/issues/2723' },
  { fixtureId: 'label', mutationId: 'alias-props', oracle: 'three-point', reason: ALIAS_PROPS_CSR_MOUNT_EMPTY, issue: 'https://github.com/piconic-ai/barefootjs/issues/2723' },
  { fixtureId: 'textarea', mutationId: 'alias-props', oracle: 'three-point', reason: ALIAS_PROPS_CSR_MOUNT_EMPTY, issue: 'https://github.com/piconic-ai/barefootjs/issues/2723' },
  {
    fixtureId: 'textarea',
    mutationId: 'alias-props',
    oracle: 'idempotence',
    reason: `${ALIAS_PROPS_CSR_MOUNT_EMPTY} Surfaces here as a fill timeout — there is no <textarea> in the csr-mount DOM to fill.`,
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2723',
  },

  // --- G4 -------------------------------------------------------------------
  {
    fixtureId: 'toggle-shared',
    mutationId: 'alias-props',
    oracle: 'idempotence',
    reason:
      "Distinct from the G3 empty-render pattern above: toggle-shared's ToggleItem list renders fully on both legs, but after replaying the two click actions the ON/OFF state lands on different rows between the hydrated and csr-mount legs (values are shuffled, not missing) — confirmed directly by diffing the two captures. Likely the alias-props indirection inside the `.map()` row body interacting with per-row closure capture.",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2724',
  },

  // --- G5 -------------------------------------------------------------------
  {
    fixtureId: 'reactive-props',
    mutationId: 'alias-props',
    oracle: 'idempotence',
    reason:
      "Click on '.btn-parent-increment' times out on one of the two legs. reactive-props already carries a known, different hydration divergence (a live .value DOM property appearing only after hydration — oracle-quarantine.ts, issue 2716) that is NOT quarantined for idempotence on the base fixture; this alias-props mutant's idempotence failure has not been isolated from that existing issue and may be the same underlying cause compounded by the extra alias hop.",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/2716',
  },

  // --- G6 -------------------------------------------------------------------
  {
    fixtureId: 'carousel',
    mutationId: 'fragment-wrap',
    oracle: 'idempotence',
    reason:
      "Click on '[data-slot=\"carousel-next\"]' times out (button stays disabled). The base fixture's idempotence oracle is already excluded (not merely quarantined) in oracle.playwright.ts's IDEMPOTENCE_EXCLUDED map for the same reason: embla's drag steps are pointer-position-dependent on a CSS-less host page (#1971), so replaying the SAME drag sequence twice is inherently flaky independent of any real bug. This mutant reproduces that known flakiness rather than a new fragment-wrap-specific defect; kept here (mutation.playwright.ts has no equivalent exclusion map, only the ORACLE_QUARANTINE skip) rather than silently passing.",
    issue: 'https://github.com/piconic-ai/barefootjs/issues/1971',
  },
]

export const MUTATION_QUARANTINE: ReadonlyMap<string, MutationQuarantineEntry> = new Map(
  ENTRIES.map(e => [key(e.fixtureId, e.mutationId, e.oracle), e]),
)

export function mutationQuarantineEntry(fixtureId: string, mutationId: string, oracle: OracleKind): MutationQuarantineEntry | undefined {
  return MUTATION_QUARANTINE.get(key(fixtureId, mutationId, oracle))
}
