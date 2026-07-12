/**
 * Plan types for `emitStaticArrayChildInits` — the shapes that
 * `static array` loops emit for child component initialisation:
 *
 *   - `single-comp`        — `loop.childComponent` ケース。一つの child component
 *                            を `querySelectorAll` で全インスタンスに initChild。
 *   - `outer-nested`       — depth 0 の `nestedComponents`。outer forEach で
 *                            `__iterEl.querySelector(...)` 経由で initChild。
 *   - `inner-loop-nested`  — depth > 0 の `nestedComponents`。outer + inner
 *                            forEach の二重ループで initChild。
 *   - `component-rooted-inner-loop`
 *                          — outer の loop item root が **child component**
 *                            (`loop.childComponent`) で、その JSX children に
 *                            component の nested `.map()` を持つケース (#1725)。
 *                            element offset では fragment-root passthrough の
 *                            flatten 済み items に届かないため、document order
 *                            の zip (`qsaChildScopes` + cursor) で initChild。
 *
 * All decisions (selector, propsExpr, offset expressions) are resolved at
 * build time so the stringifier becomes a deterministic walk.
 *
 * Replaces the legacy 120-line `emitStaticArrayChildInits` whose emission
 * shapes were determined by inline branching on the IR.
 */

import type { PreludeStatements } from '../control-flow/plan/inner-loop.ts'

/** Pre-built `{ name: value, ... }` props object expression. */
export type PropsExpr = string

/** A single child-component initialiser inside an inner-loop body. */
export interface InnerLoopComp {
  componentName: string
  /**
   * JS source expression (a single-quoted string literal) embedded into
   * `__innerEl.querySelector(<here>)`. See `buildCompSelector`.
   */
  selector: string
  /** Pre-built props object expression. */
  propsExpr: PropsExpr
}

/** Plan for `loop.childComponent` (single child component per iteration). */
export interface SingleCompInitPlan {
  kind: 'single-comp'
  /** Container variable name — e.g. `_s4` (already prefixed). */
  containerVar: string
  componentName: string
  /**
   * JS source expression (single-quoted string literal) embedded into
   * `containerVar.querySelectorAll(<here>)`. Combines slotId-suffix match
   * with name-prefix match.
   */
  childSelector: string
  /** Array expression as written in user code. */
  arrayExpr: string
  /** Loop parameter identifier. */
  param: string
  /** Index parameter identifier (e.g. `__idx` or user-supplied). */
  indexParam: string
  /**
   * Outer `.map()` callback preamble locals (#1064), emitted inside the
   * `__childScopes.forEach` body after the `const <param> = ...[__idx]`
   * lookup so the propsExpr getter can resolve them. Empty when no
   * preamble.
   */
  outerPreludeStatements: PreludeStatements
  /** Pre-built props object expression for the child component. */
  propsExpr: PropsExpr
}

/** Plan for one depth-0 component inside `loop.nestedComponents`. */
export interface OuterNestedInitPlan {
  kind: 'outer-nested'
  containerVar: string
  componentName: string
  /**
   * JS source expression (single-quoted string literal) embedded into
   * `__iterEl.querySelector(<here>)`. See `buildCompSelector`.
   */
  selector: string
  arrayExpr: string
  param: string
  indexParam: string
  /** `indexParam` plus any sibling-offset terms (`+ 1 + (arr).length`) — already substituted. */
  offsetExpr: string
  /**
   * Outer `.map()` callback preamble locals (#1064), emitted inside the
   * outer `forEach`'s `if (__iterEl)` block — i.e. only when the SSR
   * element exists, matching `inner-loop-nested`'s post-guard placement.
   * Empty when the source had no preamble.
   */
  outerPreludeStatements: PreludeStatements
  propsExpr: PropsExpr
}

/**
 * Plan for one inner-loop level's nested components (depth > 0). Mirrors
 * the `outer.forEach((p, idx) => inner.forEach((q, jdx) => initChild...))`
 * shape verbatim; multiple `comps` share the same outer/inner skeleton.
 */
export interface InnerLoopNestedInitPlan {
  kind: 'inner-loop-nested'
  containerVar: string
  /** Outer loop's array expression. */
  outerArrayExpr: string
  outerParam: string
  outerIndexParam: string
  /** Outer offset — `outerIndexParam` plus any sibling-offset terms. */
  outerOffsetExpr: string
  /**
   * Outer `.map()` callback preamble locals, emitted after the
   * `if (!__outerEl) return` guard so the inner forEach (and its
   * component setup) can resolve them (#1064). Empty when no preamble.
   */
  outerPreludeStatements: PreludeStatements
  /**
   * Inner loop's container slot id. When non-null, the stringifier emits
   * `__outerEl.querySelector('[bf="..."]') || __outerEl`; otherwise
   * `__outerEl` is used directly.
   */
  innerContainerSlotId: string | null
  innerArrayExpr: string
  innerParam: string
  /**
   * Inner index parameter identifier — the user's declared `.map((item, i)
   * => ...)` index name, or the synthetic `__innerIdx` when the callback
   * declares none (#2231). Emitted as the inner `forEach`'s second param so
   * prop getters that close over the index resolve it (previously the
   * synthetic name was hardcoded and a referenced user index threw
   * `ReferenceError` from `initChild`'s first prop read).
   */
  innerIndexParam: string
  /** Inner offset — `innerIndexParam` plus any sibling-offset terms. */
  innerOffsetExpr: string
  /**
   * Inner `.map()` callback preamble locals, emitted after the
   * `if (!__innerEl) return` guard so the per-component prop getters
   * can resolve them (#1064). Empty when no preamble.
   */
  innerPreludeStatements: PreludeStatements
  /** Depth used in the leading comment line (e.g. `depth 2`). */
  depth: number
  /** Per-component initialisers emitted inside the inner forEach body. */
  comps: readonly InnerLoopComp[]
}

/**
 * Plan for an inner `.map()` of components living inside a **component-rooted**
 * outer loop item (#1725). The outer loop body is a single child component
 * (`loop.childComponent`, e.g. a `SelectGroup` passthrough) whose JSX
 * `children` contain a nested `.map()` of components (e.g. `SelectItem`).
 *
 * `inner-loop-nested` can't be reused here: it addresses inner components via
 * `containerVar.children[outerOffset]`, which assumes the outer loop item is a
 * DOM **element**. A fragment-rooted passthrough component (`<>{children}</>`)
 * emits no wrapper element, so its rendered items are flattened directly under
 * the parent container with no per-group element to index.
 *
 * Instead this shape zips the inner component scopes — found in document order
 * via `qsaChildScopes(container, <selector>)` — against the flattened
 * `outer.forEach(o => inner.forEach(i => ...))` iteration. Document order is
 * the SSR render order, so position `__ci++` pairs each scope with its data
 * item regardless of whether the outer component root is an element or a
 * fragment.
 */
export interface ComponentRootedInnerLoopInitPlan {
  kind: 'component-rooted-inner-loop'
  containerVar: string
  /** Outer loop's array expression. */
  outerArrayExpr: string
  outerParam: string
  /**
   * Outer `.map()` index param name, or `null` when the callback declares
   * none (#2231). Unlike `inner-loop-nested`, this shape needs no synthetic
   * fallback — the document-order zip never indexes by position — so the
   * param is appended to the `forEach` head only when declared, keeping
   * index-less loops byte-identical.
   */
  outerIndexParam: string | null
  /** Outer `.map()` callback preamble locals (#1064). */
  outerPreludeStatements: PreludeStatements
  /** Inner loop's array expression (references the outer param). */
  innerArrayExpr: string
  innerParam: string
  /** Inner `.map()` index param name, or `null` — see `outerIndexParam` (#2231). */
  innerIndexParam: string | null
  /** Inner `.map()` callback preamble locals (#1064). */
  innerPreludeStatements: PreludeStatements
  /** Depth used in the leading comment line. */
  depth: number
  /** Per-component initialisers emitted inside the inner forEach body. */
  comps: readonly InnerLoopComp[]
}

export type StaticArrayChildInitPlan =
  | SingleCompInitPlan
  | OuterNestedInitPlan
  | InnerLoopNestedInitPlan
  | ComponentRootedInnerLoopInitPlan

export type StaticArrayChildInitsPlan = readonly StaticArrayChildInitPlan[]
