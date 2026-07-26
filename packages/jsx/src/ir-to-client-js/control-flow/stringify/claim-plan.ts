/**
 * Claim-plan literal rendering — the compiler-side half of slot unification
 * A3 (`spec/slot-unification.md` §4/§5-A3). The runtime's `SlotSpec`/
 * `ClaimPlan` (`@barefootjs/client/runtime/claim-slots.ts`, A2) are pure
 * data: `{ id, kind, path }` triples. This module is the single place that
 * turns compile-time slot descriptors into that data's source-text form —
 * every content-slot emission site (loop rows, preamble regions, dynamic
 * text/JSX slots, `@client` expressions) renders its plan through
 * `claimPlanLiteral`, never by hand-splicing strings, so the literal shape
 * can only ever match `SlotSpec`.
 *
 * Paths are real root-relative child-index arrays wherever the caller
 * already has them (the hoisted single-root loop skeleton, #2143's
 * `SkeletonSlotPaths`); everywhere else a slot gets `path: []` and A2's
 * `lazySlots`/`claimSlots` marker-scan fallback resolves it — sound, just a
 * per-claim scan instead of an O(depth) walk. This is the explicit
 * "cannot be statically pathed" escape valve `spec/slot-unification.md`
 * §5-A3 sanctions, not a shortcut invented here.
 */

export interface ClaimSlotSpec {
  readonly id: string
  readonly kind: 'text' | 'markup'
  /** Root-relative child-index path, used when the path is unconditionally
   *  valid at claim time. Ignored when `pathExpr` is set. */
  readonly path: readonly number[]
  /**
   * Raw JS expression (already rendered source text) evaluating to a
   * `number[]` at runtime, for the one case a plain literal can't express:
   * a hoisted-skeleton path that's valid ONLY on the fresh-CSR-clone branch,
   * never on the hydration-adopts-SSR branch (#2143 precedent — `__p` is
   * nulled when `__existing` is truthy because the skeleton's simplified
   * markup doesn't describe the real SSR-rendered tree). Typically
   * `__existing ? [] : [1, 0]`. Overrides `path` when present.
   */
  readonly pathExpr?: string
  /**
   * Slot unification Step B (`spec/slot-unification.md` §3(b), §5 Step B):
   * true when NO marker was emitted for this slot — `path`'s last index is
   * the slot's own position, not an anchor comment. Only ever set by
   * `client-only-elision.ts`-derived callers; every other emission site
   * omits it (falsy = today's marker-based behavior, unchanged).
   */
  readonly markerless?: boolean
}

/** Render one `SlotSpec` as a source-text object literal. */
function slotSpecLiteral(slot: ClaimSlotSpec): string {
  const pathSrc = slot.pathExpr ?? `[${slot.path.join(', ')}]`
  const markerlessSrc = slot.markerless ? ', markerless: true' : ''
  return `{ id: '${slot.id}', kind: '${slot.kind}', path: ${pathSrc}${markerlessSrc} }`
}

/** Render a `ClaimPlan` (an array of `SlotSpec`) as a source-text array literal. */
export function claimPlanLiteral(slots: readonly ClaimSlotSpec[]): string {
  return `[${slots.map(slotSpecLiteral).join(', ')}]`
}

/**
 * A stable JS identifier for the claimed-slot writer covering `slots`,
 * derived from the first slot's id. Slot ids are unique per component (the
 * `bf="sN"` marker namespace), so this can never collide across two
 * distinct claim-plan call sites within the same emitted component.
 */
export function claimWriterVarName(slots: readonly ClaimSlotSpec[], sanitize: (id: string) => string): string {
  const first = slots[0]?.id ?? '0'
  return `__bfw_${sanitize(first)}`
}
