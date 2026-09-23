/**
 * Bounded-exploration quarantine ledger (#3046).
 *
 * `explore.playwright.ts` runs two kinds of check per scenario:
 *
 *   - per reachable STATE: the existing `snap` / `three-point` oracles
 *     (`oracle-core.ts`) against that state's fresh fixture — keyed here
 *     on `state:s<index>` (the state's discovery index in the manifest).
 *   - per action PATH: the transition oracles (`transition-hydrate`,
 *     `transition-csr`) — "click this sequence from the initial state,
 *     then compare against a fresh render of the reduced state" — and the
 *     keyed-identity oracles (`identity-hydrate`, `identity-csr`) — "every
 *     keyed row whose key survives the sequence is the same DOM node" —
 *     keyed on the path id (`append>removeLast`).
 *
 * Same rot-check discipline as `pairwise-quarantine.ts`: a quarantined
 * row is asserted to STILL fail, so a fix that lands turns the row into a
 * loud "stale — delete the entry" failure instead of a silent skip that
 * outlives the bug. Key STRICTLY on the exact (scenario, subject, oracle)
 * triple — never a pattern: N paths failing from one root cause are N
 * rows sharing one `reason`/`limitation`, not one wildcard row.
 *
 * Every row cites a `silent` entry in the known-limitation registry
 * (`packages/adapter-tests/limitations/<id>.ts`); the compat join test
 * (`packages/compat/src/__tests__/limitations-join.test.ts`) checks the
 * id exists. A generated exploration case is not itself a corpus fixture,
 * so — like the mutation and pairwise ledgers — the entry's `fixtures`
 * list names the minimal committed reproduction, not this case.
 */

import type { OracleKind } from './oracle-quarantine'

export type ExploreOracleKind =
  | OracleKind
  | 'transition-hydrate'
  | 'transition-csr'
  | 'identity-hydrate'
  | 'identity-csr'
  /** Adapter axis only: the adapter's backend rendered every reachable state (subject `scenario`). */
  | 'render'

export interface ExploreQuarantineEntry {
  /**
   * SSR adapter of the run (`explore/adapters.ts`); omitted for the Hono
   * reference run. Adapter-axis runs only carry `render`, `snap`,
   * `transition-hydrate` and `identity-hydrate` — the csr-mount leg is
   * adapter-independent.
   */
  adapter?: string
  scenarioId: string
  /** `state:s<index>` for a per-state oracle, or the path id for a transition oracle. */
  subject: string
  oracle: ExploreOracleKind
  /** Why — a short human summary of the observed divergence. */
  reason: string
  /** Registry limitation id (`packages/adapter-tests/limitations/<id>.ts`, kind `silent`). */
  limitation: string
}

export function exploreQuarantineKey(
  scenarioId: string,
  subject: string,
  oracle: ExploreOracleKind,
  adapter: string = 'hono',
): string {
  const prefix = adapter === 'hono' ? '' : `${adapter}/`
  return `${prefix}${scenarioId}::${subject}::${oracle}`
}

// Formerly held 50 rows for `child-prop-loop` and `child-mount-unmount`,
// all citing the registry's `child-prop-mirror-attr-ssr` mechanism
// (`collectReactiveChildProps` / `emitReactiveChildProps` mirroring a
// parent-passed named prop onto a child component's root as a DOM
// attribute the child never renders — `data="[object Object]"` on
// `ItemList`'s `<ul>`, `label="a"` on a client-constructed `Badge`).
// #3055 gated the mirror's generic/presence writes on `target.hasAttribute`
// (`emitAttrUpdate`'s `mirrorPresentOnly`), so the mirror now only ever
// touches an attribute the child's OWN render already put there — it never
// plants one SSR/a fresh client mount wouldn't have. All 50 rows passed and
// were deleted.
//
// `child-listener-cleanup` / `child-effect-disposal` formerly held 100
// rows citing `conditional-branch-child-double-init`: a child inside a
// reactive conditional branch that is active at hydration / client mount
// was initialized twice (once by the branch's own `insert()` bindEvents,
// once by a trailing static `initChild` on a node the branch had already
// replaced), so its onMount listener or effect ran in two instances and
// only one was disposed with the branch. `collectElements` now leaves a
// branch-owned child to the branch; all 100 rows passed and were deleted.

// `go-template` adapter axis: every scenario seeds its signals from members
// of its `initial` prop (`createSignal(initial.items)`), which Go bakes as
// `nil` — so its SSR renders the zero value (empty text, the falsy branch,
// no loop rows) and differs from the hydrated / fresh render, and the three
// scenarios that forward such a signal to a child's typed prop fail to
// compile. One root cause; the minimal committed reproductions are the
// corpus fixtures `nested-prop-member-signal-seed` and
// `nested-prop-signal-child-prop` (Go `renderDivergences`).
const GO_SEED = 'nested-prop-member-signal-seed'
const GO_SEED_REASON = "a signal seeded from a member of the `initial` prop is baked as `nil` on Go, so the SSR renders its zero value (or `types.go` fails to compile)"
const GO_SEED_ROWS: ReadonlyArray<readonly [scenarioId: string, subject: string, oracle: ExploreOracleKind]> = [
  ['comment-root-child-slot', 'state:s1', 'snap'],
  ['child-effect-disposal', 'scenario', 'render'],
  ['child-listener-cleanup', 'state:s0', 'snap'],
  ['child-listener-cleanup', 'state:s1', 'snap'],
  ['child-listener-cleanup', 'state:s2', 'snap'],
  ['child-listener-cleanup', 'state:s3', 'snap'],
  ['child-listener-cleanup', 'state:s4', 'snap'],
  ['child-listener-cleanup', 'state:s5', 'snap'],
  ['child-listener-cleanup', 'state:s6', 'snap'],
  ['child-mount-unmount', 'scenario', 'render'],
  ['child-prop-loop', 'state:s1', 'snap'],
  ['child-prop-loop', 'state:s2', 'snap'],
  ['child-prop-loop', 'append', 'transition-hydrate'],
  ['child-prop-loop', 'append>append', 'transition-hydrate'],
  ['child-prop-loop', 'append>cloneAll', 'transition-hydrate'],
  ['child-prop-loop', 'append>rotate', 'transition-hydrate'],
  ['child-prop-loop', 'clear>append', 'transition-hydrate'],
  ['child-prop-loop', 'cloneAll>append', 'transition-hydrate'],
  ['child-prop-loop', 'removeLast>append', 'transition-hydrate'],
  ['child-prop-loop', 'rotate>append', 'transition-hydrate'],
  ['child-prop-loop-positions', 'state:s0', 'snap'],
  ['child-prop-loop-positions', 'state:s1', 'snap'],
  ['child-prop-loop-positions', 'state:s2', 'snap'],
  ['child-prop-loop-positions', 'state:s3', 'snap'],
  ['child-prop-loop-positions', 'state:s4', 'snap'],
  ['child-prop-loop-positions', 'state:s5', 'snap'],
  ['child-prop-loop-positions', 'state:s6', 'snap'],
  ['child-prop-loop-positions', 'state:s7', 'snap'],
  ['child-prop-loop-positions', 'state:s8', 'snap'],
  ['child-prop-loop-positions', 'state:s9', 'snap'],
  ['child-prop-loop-positions', 'state:s10', 'snap'],
  ['child-prop-loop-positions', 'state:s11', 'snap'],
  ['child-prop-loop-positions', 'state:s12', 'snap'],
  ['child-prop-loop-positions', 'state:s13', 'snap'],
  ['child-prop-loop-positions', 'state:s14', 'snap'],
  ['child-prop-loop-positions', 'state:s15', 'snap'],
  ['child-prop-loop-positions', 'state:s16', 'snap'],
  ['child-prop-loop-positions', 'state:s17', 'snap'],
  ['child-prop-loop-positions', 'state:s18', 'snap'],
  ['child-prop-loop-positions', 'state:s19', 'snap'],
  ['child-prop-loop-positions', 'state:s20', 'snap'],
  ['child-prop-loop-positions', 'state:s21', 'snap'],
  ['child-prop-loop-positions', 'state:s22', 'snap'],
  ['child-prop-loop-positions', 'state:s23', 'snap'],
  ['child-prop-loop-positions', 'state:s24', 'snap'],
  ['child-prop-loop-positions', 'state:s25', 'snap'],
  ['child-prop-loop-positions', 'insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'insertMid>swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'prepend>swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeFirst>swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'removeMid>swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'reverse>swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>insertMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>prepend', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>removeFirst', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>removeMid', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>reverse', 'transition-hydrate'],
  ['child-prop-loop-positions', 'swapEnds>swapEnds', 'transition-hydrate'],
  ['child-prop-slots', 'state:s1', 'snap'],
  ['conditional-toggle', 'state:s1', 'snap'],
  ['conditional-toggle', 'hide>hide>show', 'transition-hydrate'],
  ['conditional-toggle', 'hide>hide>toggle', 'transition-hydrate'],
  ['conditional-toggle', 'hide>show', 'transition-hydrate'],
  ['conditional-toggle', 'hide>show>show', 'transition-hydrate'],
  ['conditional-toggle', 'hide>toggle', 'transition-hydrate'],
  ['conditional-toggle', 'hide>toggle>show', 'transition-hydrate'],
  ['conditional-toggle', 'show', 'transition-hydrate'],
  ['conditional-toggle', 'show>hide>show', 'transition-hydrate'],
  ['conditional-toggle', 'show>hide>toggle', 'transition-hydrate'],
  ['conditional-toggle', 'show>show', 'transition-hydrate'],
  ['conditional-toggle', 'show>show>show', 'transition-hydrate'],
  ['conditional-toggle', 'show>toggle>show', 'transition-hydrate'],
  ['conditional-toggle', 'show>toggle>toggle', 'transition-hydrate'],
  ['conditional-toggle', 'toggle', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>hide>show', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>hide>toggle', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>show', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>show>show', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>toggle>show', 'transition-hydrate'],
  ['conditional-toggle', 'toggle>toggle>toggle', 'transition-hydrate'],
  ['fragment-root-toggle', 'state:s0', 'snap'],
  ['fragment-root-toggle', 'state:s1', 'snap'],
  ['fragment-root-toggle', 'state:s2', 'snap'],
  ['fragment-root-toggle', 'state:s3', 'snap'],
  ['grandchild-prop-chain', 'scenario', 'render'],
  ['keyed-loop-inline', 'state:s0', 'snap'],
  ['keyed-loop-inline', 'state:s1', 'snap'],
  ['keyed-loop-inline', 'state:s2', 'snap'],
  ['keyed-loop-inline', 'state:s4', 'snap'],
  ['keyed-loop-inline', 'state:s5', 'snap'],
  ['keyed-loop-inline', 'state:s6', 'snap'],
  ['keyed-loop-inline', 'state:s8', 'snap'],
  ['keyed-loop-inline', 'state:s9', 'snap'],
  ['keyed-loop-inline', 'state:s10', 'snap'],
  ['keyed-loop-inline', 'state:s11', 'snap'],
  ['keyed-loop-inline', 'state:s12', 'snap'],
  ['keyed-loop-inline', 'append', 'transition-hydrate'],
  ['keyed-loop-inline', 'append>append', 'transition-hydrate'],
  ['keyed-loop-inline', 'append>clear', 'transition-hydrate'],
  ['keyed-loop-inline', 'append>cloneAll', 'transition-hydrate'],
  ['keyed-loop-inline', 'append>removeLast', 'transition-hydrate'],
  ['keyed-loop-inline', 'append>rotate', 'transition-hydrate'],
  ['keyed-loop-inline', 'clear>append', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll>append', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll>clear', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll>cloneAll', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll>removeLast', 'transition-hydrate'],
  ['keyed-loop-inline', 'cloneAll>rotate', 'transition-hydrate'],
  ['keyed-loop-inline', 'removeLast>append', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate>append', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate>clear', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate>cloneAll', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate>removeLast', 'transition-hydrate'],
  ['keyed-loop-inline', 'rotate>rotate', 'transition-hydrate'],
  ['keyed-loop-positions', 'state:s0', 'snap'],
  ['keyed-loop-positions', 'state:s1', 'snap'],
  ['keyed-loop-positions', 'state:s2', 'snap'],
  ['keyed-loop-positions', 'state:s3', 'snap'],
  ['keyed-loop-positions', 'state:s4', 'snap'],
  ['keyed-loop-positions', 'state:s5', 'snap'],
  ['keyed-loop-positions', 'state:s6', 'snap'],
  ['keyed-loop-positions', 'state:s7', 'snap'],
  ['keyed-loop-positions', 'state:s8', 'snap'],
  ['keyed-loop-positions', 'state:s9', 'snap'],
  ['keyed-loop-positions', 'state:s10', 'snap'],
  ['keyed-loop-positions', 'state:s11', 'snap'],
  ['keyed-loop-positions', 'state:s12', 'snap'],
  ['keyed-loop-positions', 'state:s13', 'snap'],
  ['keyed-loop-positions', 'state:s14', 'snap'],
  ['keyed-loop-positions', 'state:s15', 'snap'],
  ['keyed-loop-positions', 'state:s16', 'snap'],
  ['keyed-loop-positions', 'state:s17', 'snap'],
  ['keyed-loop-positions', 'state:s18', 'snap'],
  ['keyed-loop-positions', 'state:s19', 'snap'],
  ['keyed-loop-positions', 'state:s20', 'snap'],
  ['keyed-loop-positions', 'state:s21', 'snap'],
  ['keyed-loop-positions', 'state:s22', 'snap'],
  ['keyed-loop-positions', 'state:s23', 'snap'],
  ['keyed-loop-positions', 'state:s24', 'snap'],
  ['keyed-loop-positions', 'state:s25', 'snap'],
  ['keyed-loop-positions', 'insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'insertMid>swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'prepend>swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeFirst>swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'removeMid>swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'reverse>swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>insertMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>prepend', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>removeFirst', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>removeMid', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>reverse', 'transition-hydrate'],
  ['keyed-loop-positions', 'swapEnds>swapEnds', 'transition-hydrate'],
  ['loop-row-handlers', 'state:s0', 'snap'],
  ['loop-row-handlers', 'state:s1', 'snap'],
  ['loop-row-handlers', 'state:s2', 'snap'],
  ['loop-row-handlers', 'state:s3', 'snap'],
  ['loop-row-handlers', 'state:s4', 'snap'],
  ['loop-row-handlers', 'state:s5', 'snap'],
  ['loop-row-handlers', 'state:s6', 'snap'],
  ['loop-row-handlers', 'state:s7', 'snap'],
  ['loop-row-handlers', 'state:s8', 'snap'],
  ['loop-row-handlers', 'state:s9', 'snap'],
  ['loop-row-handlers', 'state:s10', 'snap'],
  ['loop-row-handlers', 'state:s11', 'snap'],
  ['loop-row-handlers', 'state:s12', 'snap'],
  ['loop-row-handlers', 'state:s13', 'snap'],
  ['loop-row-handlers', 'state:s14', 'snap'],
  ['loop-row-handlers', 'state:s15', 'snap'],
  ['loop-row-handlers', 'state:s16', 'snap'],
  ['loop-row-handlers', 'state:s17', 'snap'],
  ['loop-row-handlers', 'state:s18', 'snap'],
  ['loop-row-handlers', 'state:s19', 'snap'],
  ['loop-row-handlers', 'state:s20', 'snap'],
  ['loop-row-handlers', 'state:s21', 'snap'],
  ['loop-row-handlers', 'state:s22', 'snap'],
  ['loop-row-handlers', 'state:s23', 'snap'],
  ['loop-row-handlers', 'state:s24', 'snap'],
  ['loop-row-handlers', 'state:s25', 'snap'],
  ['loop-row-handlers', 'state:s26', 'snap'],
  ['loop-row-handlers', 'state:s27', 'snap'],
  ['loop-row-handlers', 'state:s28', 'snap'],
  ['loop-row-handlers', 'state:s29', 'snap'],
  ['loop-row-handlers', 'state:s30', 'snap'],
  ['loop-row-handlers', 'state:s31', 'snap'],
  ['loop-row-handlers', 'state:s32', 'snap'],
  ['loop-row-handlers', 'state:s33', 'snap'],
  ['loop-row-handlers', 'state:s34', 'snap'],
  ['loop-row-handlers', 'state:s35', 'snap'],
  ['loop-row-handlers', 'state:s36', 'snap'],
  ['loop-row-handlers', 'state:s37', 'snap'],
  ['loop-row-handlers', 'state:s38', 'snap'],
  ['loop-row-handlers', 'state:s39', 'snap'],
  ['loop-row-handlers', 'state:s40', 'snap'],
  ['loop-row-handlers', 'state:s41', 'snap'],
  ['loop-row-handlers', 'state:s42', 'snap'],
  ['loop-row-handlers', 'state:s43', 'snap'],
  ['loop-row-handlers', 'state:s44', 'snap'],
  ['loop-row-handlers', 'state:s45', 'snap'],
  ['loop-row-handlers', 'state:s46', 'snap'],
  ['loop-row-handlers', 'state:s47', 'snap'],
  ['loop-row-handlers', 'state:s48', 'snap'],
  ['loop-row-handlers', 'state:s49', 'snap'],
  ['loop-row-handlers', 'state:s50', 'snap'],
  ['loop-row-handlers', 'state:s51', 'snap'],
  ['loop-row-handlers', 'bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>bumpRow>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>bumpRow>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>bumpRow>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>bumpRow>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend>bumpRow', 'identity-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>prepend>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>removeFirst>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>removeFirst>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>removeFirst>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>removeFirst>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>reverse>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>reverse>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>reverse>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'bumpRow>reverse>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow', 'identity-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>bumpRow', 'identity-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>prepend', 'identity-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>removeFirst', 'identity-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>reverse', 'identity-hydrate'],
  ['loop-row-handlers', 'prepend>bumpRow>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>prepend>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>prepend>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>prepend>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>prepend>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>removeFirst>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>removeFirst>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>removeFirst>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>removeFirst>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>reverse>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>reverse>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>reverse>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'prepend>reverse>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>bumpRow>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>bumpRow>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>bumpRow>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>bumpRow>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>prepend>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>prepend>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>prepend>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>removeFirst>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>removeFirst>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>reverse>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'removeFirst>reverse>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>bumpRow>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>bumpRow>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>bumpRow>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>bumpRow>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>prepend>bumpRow', 'identity-hydrate'],
  ['loop-row-handlers', 'reverse>prepend>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>prepend>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>prepend>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>prepend>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>removeFirst>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>removeFirst>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>removeFirst>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>removeFirst>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>reverse', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>reverse>bumpRow', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>reverse>prepend', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>reverse>removeFirst', 'transition-hydrate'],
  ['loop-row-handlers', 'reverse>reverse>reverse', 'transition-hydrate'],
  ['nested-loop', 'addGroup', 'transition-hydrate'],
  ['nested-loop', 'addGroup>addGroup', 'transition-hydrate'],
  ['nested-loop', 'addGroup>addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'addGroup>removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'addGroup>reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'addGroup>reverseGroups', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst>addGroup', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst>addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst>removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst>reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'addItemFirst>reverseGroups', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup>addGroup', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup>addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup>removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup>reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'removeFirstGroup>reverseGroups', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems>addGroup', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems>addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems>removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems>reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'reverseFirstItems>reverseGroups', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups>addGroup', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups>addItemFirst', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups>removeFirstGroup', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups>reverseFirstItems', 'transition-hydrate'],
  ['nested-loop', 'reverseGroups>reverseGroups', 'transition-hydrate'],
]

// A client component whose whole return is a child-component call
// (`comment-root-child-slot`, from #3122): these adapters render the
// child's output without the parent's `<!--bf-scope:...-->` comment pair,
// so the parent never hydrates and its forwarded `load` handler does
// nothing. Every path that reaches `loaded` diverges; the minimal
// committed reproduction is the corpus fixture
// `component-root-client-scope` (each adapter's `renderDivergences`).
const COMPONENT_ROOT_SCOPE = 'component-root-client-scope-comment'
const COMPONENT_ROOT_SCOPE_REASON = "the parent's scope comment is missing from the SSR, so the parent never hydrates and the forwarded `load` handler does nothing"
const COMPONENT_ROOT_SCOPE_ROWS: ReadonlyArray<readonly [adapter: string, subject: string]> = [
  ['blade', 'load'],
  ['blade', 'load>load'],
  ['blade', 'clear>load'],
  ['erb', 'load'],
  ['erb', 'load>load'],
  ['erb', 'clear>load'],
  ['jinja', 'load'],
  ['jinja', 'load>load'],
  ['jinja', 'clear>load'],
  ['minijinja', 'load'],
  ['minijinja', 'load>load'],
  ['minijinja', 'clear>load'],
  ['mojolicious', 'load'],
  ['mojolicious', 'load>load'],
  ['mojolicious', 'clear>load'],
  ['pebble', 'load'],
  ['pebble', 'load>load'],
  ['pebble', 'clear>load'],
  ['twig', 'load'],
  ['twig', 'load>load'],
  ['twig', 'clear>load'],
  ['xslate', 'load'],
  ['xslate', 'load>load'],
  ['xslate', 'clear>load'],
]

const ROWS: ReadonlyArray<ExploreQuarantineEntry> = [
  ...GO_SEED_ROWS.map(([scenarioId, subject, oracle]) => ({
    adapter: 'go-template',
    scenarioId,
    subject,
    oracle,
    reason: GO_SEED_REASON,
    limitation: GO_SEED,
  })),
  ...COMPONENT_ROOT_SCOPE_ROWS.map(([adapter, subject]) => ({
    adapter,
    scenarioId: 'comment-root-child-slot',
    subject,
    oracle: 'transition-hydrate' as const,
    reason: COMPONENT_ROOT_SCOPE_REASON,
    limitation: COMPONENT_ROOT_SCOPE,
  })),
]

export const EXPLORE_QUARANTINE: ReadonlyMap<string, ExploreQuarantineEntry> = new Map(
  ROWS.map(row => [exploreQuarantineKey(row.scenarioId, row.subject, row.oracle, row.adapter), row]),
)

export function exploreQuarantineEntry(
  scenarioId: string,
  subject: string,
  oracle: ExploreOracleKind,
  adapter: string = 'hono',
): ExploreQuarantineEntry | undefined {
  return EXPLORE_QUARANTINE.get(exploreQuarantineKey(scenarioId, subject, oracle, adapter))
}
