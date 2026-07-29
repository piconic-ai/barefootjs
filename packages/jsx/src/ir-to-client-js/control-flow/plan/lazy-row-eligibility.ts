/**
 * Lazy row graph eligibility — `spec/slot-unification.md` §9.4 (L3).
 *
 * ONE explicit decision function (`lazyRowEligibility`) answering a single
 * question: may this plain loop row be emitted through `mapArrayLazy`
 * (a compiler-emitted `LazyRowPlan`, no per-row reactive resources) instead
 * of today's A3b-consolidated eager `mapArray` emission?
 *
 * Sound-or-loud (§9.3): the answer is always either `{ eligible: true }` or
 * `{ eligible: false, reason }`. There is no silent third path — an
 * ineligible loop keeps byte-for-byte today's emission, and `reason` is a
 * human-readable string so a regression is diagnosable from a unit test
 * rather than by diffing generated JS.
 *
 * The gate is deliberately conservative. Every restriction below is a
 * "widen later" decision, never a correctness compromise:
 *
 *  1. **Shape** (§9.4 "plain loop-row shape"): non-anchored, non-flatMap,
 *     single-root, keyed, conditional-free, ref-free, no nested components
 *     or inner loops.
 *  2. **No preamble.** A `.map()` callback preamble declares row-local
 *     bindings (and can declare row-local signals/memos, which need per-row
 *     reactivity by definition). Proving "declares no signal/memo" is not
 *     cheap here, and every preamble-declared local would land in a
 *     binding's free-identifier set as an unresolvable name anyway — so the
 *     rule is the cheap conservative one: **any** `mapPreambleWrapped` or
 *     any `preambleRegions` entry makes the loop ineligible.
 *  3. **Every reactive outer dependency must be primable.** `mapArrayLazy`
 *     creates ONE loop-level effect for `applyOuter`; that effect subscribes
 *     only to what its body reads, and its body must read the outer signals
 *     even when the entry list is momentarily EMPTY (otherwise the effect
 *     never subscribes and the loop goes permanently dead). The emitter
 *     primes those reads with `getter()` statements, which is only possible
 *     for names it can prove are zero-arg component signal / memo getters.
 *     Any other name that could change reactively — a prop accessor (props
 *     may be defined as getters over the parent's signals), or a name the
 *     compiler cannot classify at all — is `opaque` and makes the loop
 *     ineligible. Imports and component-local functions are opaque TOO
 *     (`const isSelected = createSelector(selected)` is an ordinary local
 *     whose CALL is the reactive read), so they refuse the loop as well —
 *     the `inert` set names them only so the refusal can say which one.
 *     Genuinely ignorable are the names that cannot carry a reactive read
 *     at all: literal-derived local / module constants and pure globals.
 *  4. **Outer-involving TEXT bindings are ACCEPTED** (§9.5, lifted).
 *     §9.3(1) requires read-compare-write seeding on `applyOuter`'s first
 *     run: compute the value, READ the current DOM, write only on
 *     difference. For an attribute that read is `getAttribute` / a DOM
 *     property on the held element ref. For a content slot the read door is
 *     `lazyClaimSlots`' `read(id)` (`claim-slots.ts`), the read-capable twin
 *     of `lazySlots` over the SAME claim. The emitter picks the door per
 *     LOOP — a loop with no outer-involving text keeps the single-closure
 *     writer — so this widening costs nothing for loops that do not use it
 *     (see `refParts` in `stringify/lazy-row.ts`).
 *  5. **Loop-source hydration consistency** (§9.3(2)): item-driven bindings
 *     are never evaluated at hydration, so the SSR rows and the first client
 *     `items()` read are TRUSTED to agree. That trust is only sound when
 *     both derive from the same data — props (identical by construction via
 *     the `bf-p` protocol), literals, and derivations thereof. Any name in
 *     the loop source that reaches an import, an environment read, or
 *     anything the compiler cannot resolve → ineligible.
 *  6. **Profile mode is never lazy** (§9.4, same policy as A3b): a merged
 *     loop-level effect would make every binding on every row share one
 *     `#binding:<slotId>` id.
 */

/** Facts about one component signal needed by the §9.3(2) source gate. */
export interface LazyRowSignalFacts {
  /**
   * Free identifiers of the signal's initializer, derived from its
   * structured `SignalInfo.parsed` tree. `null` when `parsed` was absent or
   * the tree contained an `unsupported` node — "unprovable", which the gate
   * treats as a hard stop rather than an assumption.
   */
  initializerFreeIdentifiers: ReadonlySet<string> | null
}

/** Component-scope facts the gate resolves names against. */
export interface LazyRowScopeInfo {
  /** Signal getter name → initializer facts. */
  signals: ReadonlyMap<string, LazyRowSignalFacts>
  /** Memo getter names — reactive and primable via `name()`. */
  memos: ReadonlySet<string>
  /** Props emit name (`_p`), the source props object name, and every destructured prop param. */
  props: ReadonlySet<string>
  /**
   * Constant name → free identifiers of its value (`ConstantInfo.freeIdentifiers`).
   * An entry with an EMPTY set is literal-derived. Absent free-id data is
   * modelled as `null` → unprovable for the source gate (but still inert for
   * the binding gate — a `const` never changes reactively).
   */
  constants: ReadonlyMap<string, ReadonlySet<string> | null>
  /**
   * Import local names and component-local function names. Used ONLY by the
   * §9.3(2) source gate (to name the failure precisely); binding
   * classification treats them as OPAQUE, not inert — see
   * {@link classifyLazyBinding}.
   */
  inert: ReadonlySet<string>
  /** Profile mode (#1690) — never lazy. */
  profile: boolean
}

/**
 * Globals a loop source may legitimately reach without breaking
 * hydration consistency: pure, deterministic, environment-free. Anything
 * NOT in this list (`Date`, `window`, `document`, `localStorage`,
 * `navigator`, `performance`, `Math.random` via `Math`… ) is rejected by
 * the source gate. `Math` is deliberately absent: `Math.random()` is an
 * environment read in every way that matters here.
 */
const PURE_SOURCE_GLOBALS: ReadonlySet<string> = new Set([
  'Object', 'Array', 'JSON', 'Number', 'String', 'Boolean',
])

/**
 * Globals that are inert for BINDING classification (they cannot change
 * reactively, so a binding reading one needs no subscription). Broader than
 * {@link PURE_SOURCE_GLOBALS} — a binding may read `Date`/`Intl` and still be
 * lazy, because the binding is re-evaluated on every apply; only the LOOP
 * SOURCE has a hydration-trust obligation.
 */
const INERT_BINDING_GLOBALS: ReadonlySet<string> = new Set([
  'Object', 'Array', 'JSON', 'Number', 'String', 'Boolean', 'Math', 'Date',
  'Intl', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'RegExp',
  'Error', 'BigInt', 'console', 'undefined', 'NaN', 'Infinity', 'globalThis',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
])

/**
 * Sentinel `opaqueOuterNames` entry for "free-identifier analysis produced
 * nothing". Distinct from a real opaque NAME: a name means the identifier
 * set is known and only its primability is not, which the re-subscribe seam
 * handles; this means the set itself is unknown, which nothing can handle.
 */
export const UNKNOWN_IDENTIFIERS = '<unknown>'

/** One reactive binding of the row, already classified at build time. */
export interface ClassifiedLazyBinding {
  kind: 'attr' | 'text'
  slotId: string
  /** Reads the loop param / a destructured param binding. */
  readsItem: boolean
  /** Reads at least one reactive outer name (or is `opaque`). */
  readsOuter: boolean
  /**
   * Reactive outer names this binding depends on — signal / memo getters the
   * emitter primes at the top of `applyOuter` so the loop-level effect
   * subscribes even with zero rows.
   */
  reactiveOuterNames: readonly string[]
  /**
   * Outer names that are neither primable (signal/memo) nor provably inert
   * — including the FAIL-SAFE case where free identifiers were unavailable
   * (then `readsItem`/`readsOuter` are both forced true and this carries the
   * `'<unknown>'` sentinel). Non-empty ⇒ ineligible.
   */
  opaqueOuterNames: readonly string[]
  /** References the loop's index parameter — `applyItem`/`applyOuter` have no index. */
  referencesIndex: boolean
}

/** §9.4 shape facts, read off the loop plan / IR by the caller. */
export interface LazyRowShapeFacts {
  /** Which emission site is asking. Both plain-loop-row sites are in scope. */
  callSite: 'plain' | 'branch-plain'
  flatMapLeafItem: boolean
  anchored: boolean
  bodyIsMultiRoot: boolean
  /** `LoopCore.key != null` — index-keyed loops are ineligible in v1 (§9.4). */
  hasExplicitKey: boolean
  conditionalCount: number
  childRefCount: number
  nestedComponentCount: number
  innerLoopCount: number
  hasChildComponent: boolean
  hasMapPreamble: boolean
  preambleRegionCount: number
  /** A destructured loop param with no `paramBindings` (snapshot unwrap). */
  hasParamUnwrap: boolean
}

export interface LazyRowEligibilityArgs {
  shape: LazyRowShapeFacts
  bindings: readonly ClassifiedLazyBinding[]
  /**
   * Free identifiers of the loop's SOURCE (`LoopCore.arrayFreeIdentifiers`
   * unioned with the free identifiers of the fully-chained array expression,
   * so `.filter(...)`/`.sort(...)` dependencies are covered). `null` when the
   * IR carried none — ineligible, never assumed empty.
   */
  arraySourceIdentifiers: ReadonlySet<string> | null
  scope: LazyRowScopeInfo
}

export type LazyRowEligibility =
  | { eligible: true }
  | { eligible: false; reason: string }

const NO: (reason: string) => LazyRowEligibility = (reason) => ({ eligible: false, reason })

/**
 * Decide whether one plain loop row may use the lazy row graph (§9.4).
 * Pure — every input is pre-resolved data, so this is directly unit-testable
 * without building a component.
 */
export function lazyRowEligibility(args: LazyRowEligibilityArgs): LazyRowEligibility {
  const { shape, bindings, arraySourceIdentifiers, scope } = args

  // (8) Profile mode keeps the granular eager emission so `#binding:<slotId>`
  //     attribution stays truthful — same policy as A3b.
  if (scope.profile) return NO('profile mode keeps the granular eager emission')

  // (1) Plain loop-row shape.
  if (shape.callSite !== 'plain' && shape.callSite !== 'branch-plain') {
    return NO(`call site '${shape.callSite}' is not a plain loop row`)
  }
  if (shape.flatMapLeafItem) return NO('flatMap descriptor loop (build-or-patch renderItem)')
  if (shape.anchored) return NO('anchored whole-item-conditional loop')

  // (2) Single-root rows — multi-root needs startMarker/extras bookkeeping
  //     `mapArrayLazy` deliberately does not carry.
  if (shape.bodyIsMultiRoot) return NO('multi-root (Fragment) row')

  // (3) Keyed via an explicit `key`.
  //
  //     This is a FAIL-SAFE, not a widening opportunity — do not plan work
  //     around it. A `.map()` whose row element has no valid `key` is already
  //     a compile ERROR upstream (BF023 / BF024, `checkLoopKey` in
  //     `jsx-to-ir.ts`), so no program that compiles cleanly can reach this
  //     branch through the plain / branch-plain call sites. It stays because
  //     the gate must not depend on another pass having rejected the input,
  //     and because a `null` keyFn would silently switch `mapArrayLazy` to
  //     positional keying — correct in itself, but a decision this function
  //     should make explicitly rather than inherit.
  //
  //     `lazy-row-eligibility.test.ts` pins the BF023 half so that if unkeyed
  //     loops ever become legal, the test naming this fails and points here.
  if (!shape.hasExplicitKey) return NO('index-keyed loop (no explicit key)')

  // (4) No conditionals in the row.
  if (shape.conditionalCount > 0) return NO('row contains a reactive conditional')

  // (5) No refs / child components / inner loops.
  if (shape.childRefCount > 0) return NO('row has imperative child refs')
  if (shape.hasChildComponent) return NO('row body is a child component')
  if (shape.nestedComponentCount > 0) return NO('row contains nested child components')
  if (shape.innerLoopCount > 0) return NO('row contains an inner loop')

  // (6) No row-local declarations — see the module docstring for why the
  //     rule is "any preamble at all", not "a preamble declaring signals".
  if (shape.hasMapPreamble) return NO('row has a map-callback preamble (may declare row-local reactivity)')
  if (shape.preambleRegionCount > 0) return NO('row has preamble-patched regions')
  if (shape.hasParamUnwrap) return NO('destructured loop param without param bindings')

  // Per-binding gates.
  for (const b of bindings) {
    if (b.referencesIndex) {
      return NO(`binding on slot ${b.slotId} references the loop index parameter`)
    }
    // An identifier set we could not compute at all is different in kind
    // from a name we CAN see but cannot prime. With `free === null` the
    // classifier knows nothing — not the outer reads, and not whether the
    // binding reads the loop INDEX (which it reports as `false` by
    // assumption, since there is nothing to look at). The seam covers
    // stranded subscriptions; it cannot conjure an index parameter that
    // `applyItem`/`applyOuter` do not have. So this one still refuses.
    if (b.opaqueOuterNames.includes(UNKNOWN_IDENTIFIERS)) {
      return NO(`binding on slot ${b.slotId} has no analyzable identifier set`)
    }
    // An outer name the emitter cannot prime used to refuse the loop: the
    // loop-level effect must subscribe on its FIRST run, and with an empty
    // entry list the per-entry reads never execute, so it would subscribe to
    // nothing and go permanently dead. The runtime's re-subscribe seam
    // in `mapArrayLazy` removes that obligation from the compiler (§9.3a):
    // every loop-level outer effect re-runs after a reconcile that created a
    // row or changed an item, so its subscription set is rebuilt against the
    // current entries no matter what the reads turn out to be. Nothing to
    // check here any more — and nothing to signal either, since the seam is
    // unconditional rather than something the compiler opts a loop into.
  }

  // (7) Hydration-consistency gate on the loop source (§9.3(2)).
  if (!arraySourceIdentifiers) return NO('loop source free identifiers unavailable')
  const sourceGate = checkSourceConsistency(arraySourceIdentifiers, scope)
  if (sourceGate) return NO(`loop source is not provably hydration-consistent: ${sourceGate}`)

  return { eligible: true }
}

/**
 * §9.3(2): walk each name in the loop source down to props / literals.
 * Returns `null` when every name resolves, otherwise the first failure
 * reason. Cycle-safe via `seen`.
 */
function checkSourceConsistency(
  names: ReadonlySet<string>,
  scope: LazyRowScopeInfo,
): string | null {
  const seen = new Set<string>()

  const resolve = (name: string): string | null => {
    if (seen.has(name)) return null // already proven (or in-progress) — cycles cannot add a new source
    seen.add(name)

    if (scope.props.has(name)) return null // prop accessor — identical to SSR by the bf-p protocol
    if (PURE_SOURCE_GLOBALS.has(name)) return null

    const constFree = scope.constants.get(name)
    if (constFree !== undefined) {
      if (constFree === null) return `constant '${name}' has no analyzable value`
      for (const inner of constFree) {
        const failure = resolve(inner)
        if (failure) return failure
      }
      return null
    }

    const signal = scope.signals.get(name)
    if (signal !== undefined) {
      if (signal.initializerFreeIdentifiers === null) {
        return `signal '${name}' has no structured initializer to prove props/literal derivation`
      }
      for (const inner of signal.initializerFreeIdentifiers) {
        const failure = resolve(inner)
        if (failure) return failure
      }
      return null
    }

    if (scope.memos.has(name)) return `memo '${name}' initializer is not analyzed by the v1 gate`
    if (scope.inert.has(name)) return `'${name}' is an import or local function`
    return `'${name}' does not resolve to a prop, literal-derived const, or props/literal-derived signal`
  }

  for (const name of names) {
    const failure = resolve(name)
    if (failure) return failure
  }
  return null
}

/**
 * Classify one binding's free identifiers into the row-local / reactive-outer
 * / opaque-outer partition {@link lazyRowEligibility} consumes.
 *
 * **FAIL-SAFE (mandatory, §9.2):** when `free` is `null` — the IR carried no
 * pre-computed free identifiers, or `freeIdentifiers()` refused the parsed
 * tree (an `unsupported` node) — BOTH `readsItem` and `readsOuter` are forced
 * true. A binding with `readsItem` is emitted into `applyItem`; a binding with
 * `readsOuter` into `applyOuter`; a binding in both is emitted in BOTH. Double
 * application is idempotent because every emitted write is dedup-guarded
 * against `entry.last`, so "both" is always the safe answer and never a
 * correctness risk.
 *
 * The unknown case ALSO records an `'<unknown>'` opaque name, which makes the
 * loop ineligible: an outer dependency the compiler cannot name is an outer
 * dependency it cannot PRIME, and an unprimed `applyOuter` effect would never
 * subscribe (see module docstring, restriction 3). So the fail-safe direction
 * is preserved (maximally conservative classification) while the emission
 * refuses loudly instead of shipping a dead effect.
 */
export function classifyLazyBinding(args: {
  kind: 'attr' | 'text'
  slotId: string
  free: ReadonlySet<string> | null
  /** Loop param name plus every destructured `paramBindings` name. */
  rowLocalNames: ReadonlySet<string>
  indexParam: string
  scope: LazyRowScopeInfo
}): ClassifiedLazyBinding {
  const { kind, slotId, free, rowLocalNames, indexParam, scope } = args

  if (free === null) {
    return {
      kind,
      slotId,
      readsItem: true,
      readsOuter: true,
      reactiveOuterNames: [],
      opaqueOuterNames: [UNKNOWN_IDENTIFIERS],
      // An ASSUMPTION, not knowledge — which is precisely why
      // `UNKNOWN_IDENTIFIERS` must keep refusing the loop: with no
      // identifier set we cannot rule out an index read either, and
      // `applyItem` / `applyOuter` have no index parameter to give it.
      referencesIndex: false,
    }
  }

  let readsItem = false
  let referencesIndex = false
  const reactiveOuterNames: string[] = []
  const opaqueOuterNames: string[] = []

  for (const name of free) {
    if (rowLocalNames.has(name)) {
      readsItem = true
      continue
    }
    if (name === indexParam) {
      referencesIndex = true
      continue
    }
    if (INERT_BINDING_GLOBALS.has(name)) continue
    if (scope.signals.has(name) || scope.memos.has(name)) {
      if (!reactiveOuterNames.includes(name)) reactiveOuterNames.push(name)
      continue
    }
    // A LITERAL-DERIVED constant (empty free-identifier set) is the only
    // non-signal local name provably incapable of reactivity: with nothing
    // free in its initializer, it cannot close over a signal, a selector, or
    // any other reactive accessor.
    //
    // Everything else is OPAQUE, and deliberately so — this is where the
    // conservative line has to sit, because a reactive accessor can hide
    // behind an ordinary-looking name:
    //   - `const isSelected = createSelector(selected)` is a local `const`
    //     whose CALL is reactive (`create-selector.test.ts`),
    //   - a local function's body can read a signal,
    //   - a prop may be defined as a getter over the parent's signals,
    //   - an imported name may be another module's `@client` module signal.
    // None of those can be primed by this emitter, and an unprimed
    // `applyOuter` effect would never subscribe. Refusing the loop (eager
    // fallback) is the sound answer; guessing "inert" would be a silent
    // never-updates bug.
    const constFree = scope.constants.get(name)
    if (constFree !== undefined && constFree !== null && constFree.size === 0) continue
    opaqueOuterNames.push(name)
  }

  return {
    kind,
    slotId,
    readsItem,
    readsOuter: reactiveOuterNames.length > 0 || opaqueOuterNames.length > 0,
    reactiveOuterNames,
    opaqueOuterNames,
    referencesIndex,
  }
}
