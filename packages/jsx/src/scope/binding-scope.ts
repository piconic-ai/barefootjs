/**
 * `BindingScope`: the one shared, immutable, stack-shaped model of "names
 * bound by a loop callback" (#2482 Stage 0). Six independent ad-hoc
 * mechanisms across the compiler currently answer this same question —
 * `ctx.loopParams` (a mutated `Set<string>` in `jsx-to-ir.ts`),
 * `collectLoopBoundNames` (`adapters/loop-bound-names.ts`),
 * `resolveStaticLoopSource`'s `isNameShadowed` callback
 * (`static-literal.ts`), and others — each reimplementing the same
 * item/index/destructure/preamble-local bookkeeping with its own bugs and
 * its own blind spots. This module is the single door those mechanisms
 * migrate onto in later stages (Stage 0 only ships the service + tests;
 * NO call site is migrated yet).
 *
 * Immutability is the point, not an incidental style choice:
 * `ctx.loopParams` is `.add`/`.delete`-mutated as `jsx-to-ir.ts` walks in
 * and back out of nested loops, so a caller that forgets (or races) a
 * `.delete()` — or that holds a reference to the "current" set across a
 * push/pop it didn't expect — silently observes the WRONG scope. A
 * restore-bug of that shape is impossible by construction here:
 * `enterLoopRow`/`enterCallback` never mutate `this`, they return a NEW
 * `BindingScope` whose parent is untouched, so holding an old reference
 * always sees the scope as it was, and there is no delete step to forget.
 *
 * Filter/sort callback params (`.filter(x => ...)`, `.sort((a, b) => ...)`,
 * a nested arrow) are bound as `'callback'` frames via `enterCallback` —
 * never folded into a `'loop-row'` frame's bindings. They are a distinct
 * scope-introduction shape (an inner function's own parameter list, not a
 * row's item/index/destructure/preamble names) even though both end up
 * "just names you can't resolve against component-level state."
 */

/**
 * How a name inside a `ScopeFrame` came to be bound — the row shapes
 * (`'item'`/`'index'`/`'destructure'`/`'preamble'`) for `'loop-row'` frames,
 * `'param'` for `'callback'` frames. One shared type because both frame
 * kinds carry the same binding metadata.
 */
export type ScopeBindingSource = 'item' | 'index' | 'destructure' | 'preamble' | 'param'

export interface ScopeBinding {
  readonly source: ScopeBindingSource
}

export interface ScopeFrame {
  readonly kind: 'loop-row' | 'callback'
  readonly bindings: ReadonlyMap<string, ScopeBinding>
}

/**
 * Structural pick satisfied by BOTH `IRLoop` (`packages/jsx/src/types.ts`)
 * and the client-JS `LoopCore` family (`packages/jsx/src/ir-to-client-js/types.ts`)
 * without importing either — this module stays dependency-free and cannot
 * form an import cycle with `types.ts` / `ir-to-client-js`.
 */
export interface LoopBindingSource {
  readonly param: string
  readonly index?: string | null
  readonly paramBindings?: readonly { readonly name: string }[]
  readonly preamble?: { readonly declaredNames: readonly string[] } | null
}

/**
 * A stack of `ScopeFrame`s, innermost frame at index 0 of the internal
 * array (i.e. `frames[0]` is what `enterLoopRow`/`enterCallback` most
 * recently pushed). `lookup`'s `depth` counts from `frames[0]`, so depth 0
 * always means "the innermost frame," independent of how many ancestor
 * frames exist.
 */
export class BindingScope {
  static readonly EMPTY: BindingScope = new BindingScope([])

  private constructor(private readonly frames: readonly ScopeFrame[]) {}

  /**
   * Child scope with a new `'loop-row'` frame for one loop's per-item
   * bindings. Parent (`this`) is not mutated; the returned scope is a
   * NEW object with `frames = [newFrame, ...this.frames]`.
   *
   * Binding semantics mirror `jsx-to-ir.ts`'s `ctx.loopParams` add site
   * EXACTLY (verified against lines ~4320-4345 and the matching delete
   * site ~4695-4710 of `packages/jsx/src/jsx-to-ir.ts`):
   *
   *   - When `loop.paramBindings` is non-empty (a destructured callback
   *     param, e.g. `.map(({ id, name }) => ...)`), each `paramBindings[i].name`
   *     is bound with source `'destructure'` and the raw `param` text
   *     (which for a destructured callback holds the ORIGINAL pattern
   *     source, e.g. `"{ id, name }"`, not a usable identifier) is NOT
   *     bound. This matches `jsx-to-ir.ts`:
   *       `if (paramBindings) { for (const b of paramBindings) ctx.loopParams.add(b.name) }`
   *     — the `else` branch (`ctx.loopParams.add(param)`) is skipped
   *     entirely when `paramBindings` is present.
   *   - Otherwise (a plain identifier param, e.g. `.map(item => ...)`),
   *     `param` itself is bound with source `'item'`.
   *   - `index` (the second callback param, e.g. `.map((item, i) => ...)`)
   *     is bound with source `'index'` when non-null/non-undefined.
   *   - Every name in `preamble.declaredNames` (a `.map()` callback's
   *     pre-return `const`/`let`/`function` locals, #2447) is bound with
   *     source `'preamble'`.
   *
   *   NOTE on a sibling mechanism this method does NOT mirror:
   *   `adapters/loop-bound-names.ts`'s `collectLoopBoundNames` adds BOTH
   *   `node.param` AND every `paramBindings[i].name` unconditionally
   *   (never skipping `param` in the destructured case) — a deliberately
   *   coarser, over-inclusive collection used only to subtract names from
   *   a flat string-typing Set (safe to over-exclude there). This method
   *   follows the precise `jsx-to-ir.ts` `ctx.loopParams` semantics, since
   *   that is the mechanism actually doing scope-shadowed name RESOLUTION
   *   (the behavior `BindingScope` replaces), not coarse exclusion.
   */
  enterLoopRow(loop: LoopBindingSource): BindingScope {
    const bindings = new Map<string, ScopeBinding>()
    if (loop.paramBindings && loop.paramBindings.length > 0) {
      for (const b of loop.paramBindings) bindings.set(b.name, { source: 'destructure' })
    } else {
      bindings.set(loop.param, { source: 'item' })
    }
    if (loop.index != null) bindings.set(loop.index, { source: 'index' })
    for (const name of loop.preamble?.declaredNames ?? []) bindings.set(name, { source: 'preamble' })

    const frame: ScopeFrame = { kind: 'loop-row', bindings }
    return new BindingScope([frame, ...this.frames])
  }

  /**
   * Child scope with a new `'callback'` frame binding `params` (a filter
   * predicate's `x`, a sort comparator's `(a, b)`, or a nested arrow's
   * parameter list) with source `'param'`. Parent is not mutated.
   */
  enterCallback(params: readonly string[]): BindingScope {
    const bindings = new Map<string, ScopeBinding>()
    for (const name of params) bindings.set(name, { source: 'param' })
    const frame: ScopeFrame = { kind: 'callback', bindings }
    return new BindingScope([frame, ...this.frames])
  }

  /** Innermost-first membership check across every frame in the stack. */
  isBound(name: string): boolean {
    for (const frame of this.frames) {
      if (frame.bindings.has(name)) return true
    }
    return false
  }

  /**
   * Resolves `name` against the frame stack innermost-first. `depth 0`
   * means the innermost (most recently entered) frame; `null` when `name`
   * is not bound in any frame.
   */
  lookup(name: string): { readonly depth: number; readonly frame: ScopeFrame; readonly binding: ScopeBinding } | null {
    for (let depth = 0; depth < this.frames.length; depth++) {
      const frame = this.frames[depth]
      const binding = frame.bindings.get(name)
      if (binding) return { depth, frame, binding }
    }
    return null
  }

  /**
   * Union of every frame's bound names (every `ScopeBindingSource`), for
   * migration interop with legacy `Set<string>`-shaped consumers (e.g.
   * `collectLoopBoundNames`'s return type) as later stages migrate them
   * onto `BindingScope`.
   *
   * This is the SHADOW-GUARD query — see {@link valueBoundNames} for the
   * other consumer class and why the two must not be conflated.
   */
  boundNames(): ReadonlySet<string> {
    const names = new Set<string>()
    for (const frame of this.frames) {
      for (const name of frame.bindings.keys()) names.add(name)
    }
    return names
  }

  /**
   * Union of names bound via `'item'`/`'index'`/`'destructure'` sources
   * only — the loop row's own per-item identity — excluding `'preamble'`
   * (a `.map()` callback's pre-return `const`/`let`/`function` locals,
   * #2447) and `'param'` (an `enterCallback` frame's filter/sort/nested-
   * arrow parameters).
   *
   * `BindingScope` has exactly two consumer classes, and conflating them
   * is the #2482 Stage 1a Commit 2 regression this split exists to
   * prevent (a `ctx.scope`-wide preamble merge flipped `tag-cloud` and
   * `preamble-cells` conformance fixtures before this method existed):
   *
   *   - SHADOW GUARDS (`tryResolveTemplateSpanFromConst`,
   *     `tryResolveIdentifierAsTemplateLiteral`, `rewriteBarePropRefs`
   *     in `jsx-to-ir.ts`) ask "is this name resolved to SOMETHING in
   *     this scope, so an outer const/prop of the same name must not be
   *     substituted here at this transform position" — every source
   *     qualifies, including a preamble local shadowing a module const.
   *     These call `isBound` / `boundNames()`.
   *   - REACTIVITY / SLOT-ID CLASSIFIERS (`referencesLoopParam`,
   *     `hasReactiveAttributes`, and the `BindingEnvironment.loopParams`
   *     feed built from `makeBindingEnv`, all in `jsx-to-ir.ts`) ask
   *     "does this expression read a value that changes per row and so
   *     needs its own patchable slot" — a preamble local already gets
   *     ITS OWN dedicated slot/region-patch machinery
   *     (`preambleRegions` / `markPreambleAttrSlots`, #2447), so folding
   *     it into this classification double-counts it. Worse: widening a
   *     text child's `reactive` flag this way is read by
   *     `hasDynamicContent` to decide whether the loop ROW's own root
   *     element needs a slot — an unrelated, narrower decision that must
   *     not move just because a preamble local is now scope-visible.
   *     These call `valueBoundNames()`.
   */
  valueBoundNames(): ReadonlySet<string> {
    const names = new Set<string>()
    for (const frame of this.frames) {
      for (const [name, binding] of frame.bindings) {
        if (binding.source === 'item' || binding.source === 'index' || binding.source === 'destructure') {
          names.add(name)
        }
      }
    }
    return names
  }

  /**
   * Drop-in for `resolveStaticLoopSource`'s `opts.isNameShadowed`
   * (`packages/jsx/src/static-literal.ts:112-128`).
   */
  asShadowPredicate(): (name: string) => boolean {
    return (name: string) => this.isBound(name)
  }
}
