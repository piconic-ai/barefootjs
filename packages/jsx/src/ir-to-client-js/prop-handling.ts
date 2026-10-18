/**
 * Props expansion, dependency analysis, and controlled component detection.
 */

import type { ParamInfo, SignalInfo } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import type { BindingScope } from '../scope/binding-scope.ts'
import { resolveRestSpreadOriginCore } from '../props-binding.ts'

/**
 * Which of the component's two "forwards the caller's leftover props"
 * bindings `name` ultimately names — `'rest'` for `ctx.restPropsName`
 * (the destructured `...rest` binding), `'props'` for `ctx.propsObjectName`
 * (a whole undestructured `(props)` parameter spread whole), or `null` when
 * `name` is neither, walking through any bare `const x__alias = <name>`
 * alias chain to get there (#2723's `alias-props` mutation aliases every
 * destructured binding, the rest parameter included, e.g.
 * `const props__alias = props`).
 *
 * A `{...spread}` attribute is recognised as "forwards the caller's
 * leftover props" (routed to the `applyRestAttrs` runtime helper /
 * excluded from the SSR template's `spreadAttrs({...})` merge, and — only
 * for the `'rest'` case — given the destructured prop names to exclude
 * from what it forwards) by comparing its source expression against
 * exactly `ctx.restPropsName` / `ctx.propsObjectName`. Without this
 * resolver an alias hop makes that comparison fail even though the spread
 * still forwards the SAME object — `collect-elements.ts` then never
 * registers the rest-attrs application at all, and `html-template.ts`'s
 * merge path stops filtering the spread out, folding it into a
 * `spreadAttrs({...})` call keyed by the alias name instead of the
 * runtime-visible one.
 *
 * The walk itself lives in `props-binding.ts`'s `resolveRestSpreadOriginCore`,
 * shared with Phase 1's slot-id decision so both phases agree on which
 * spreads forward the caller's leftover props (#2754). This wrapper only
 * supplies the `ClientJsContext`-shaped inputs.
 */
export function resolveRestSpreadOrigin(ctx: ClientJsContext, name: string): 'rest' | 'props' | null {
  return resolveRestSpreadOriginCore(ctx, localConstantValues(ctx), name)
}

/**
 * `ctx.localConstants` indexed by name, memoized per `ctx`.
 *
 * A `Map` rather than the `.find(` this file's other two constant lookups
 * use, deliberately: those two are SHADOW-GUARDED lookups that
 * `binding-scope-ratchet.test.ts` deliberately counts, and that ledger is
 * shrink-only and at its floor. Resolving an alias chain hop-by-hop would
 * have added a third counted use — and a hot one, since the walk queries
 * once per hop — so it indexes instead, which is both outside the ledger's
 * concern and cheaper than a linear scan per hop.
 */
const _localConstantValuesCache: WeakMap<ClientJsContext, ReadonlyMap<string, string | undefined>> = new WeakMap()

function localConstantValues(ctx: ClientJsContext): ReadonlyMap<string, string | undefined> {
  const cached = _localConstantValuesCache.get(ctx)
  if (cached) return cached
  const byName = new Map<string, string | undefined>()
  for (const constant of ctx.localConstants) {
    if (!byName.has(constant.name)) byName.set(constant.name, constant.value)
  }
  _localConstantValuesCache.set(ctx, byName)
  return byName
}

/**
 * Every name that resolves (via `resolveRestSpreadOrigin`) to either of the
 * component's "forwards the caller's leftover props" bindings — used where
 * callers need SET membership (`restSpreadNames?.has(...)` in
 * `html-template.ts`) rather than a per-name resolution. Memoized per
 * `ctx` (`WeakMap`, mirroring `free-refs.ts`'s `_bindingMapCache`) since
 * some callers build this once per component and query it while walking
 * the whole tree.
 */
const _restSpreadNamesCache: WeakMap<ClientJsContext, ReadonlySet<string>> = new WeakMap()

export function resolveRestSpreadNames(ctx: ClientJsContext): ReadonlySet<string> {
  const cached = _restSpreadNamesCache.get(ctx)
  if (cached) return cached

  const names = new Set<string>()
  if (ctx.restPropsName) names.add(ctx.restPropsName)
  if (ctx.propsObjectName) names.add(ctx.propsObjectName)
  for (const constant of ctx.localConstants) {
    if (resolveRestSpreadOrigin(ctx, constant.name) !== null) names.add(constant.name)
  }

  _restSpreadNamesCache.set(ctx, names)
  return names
}

/**
 * Expand dynamic prop value by resolving local constants.
 *
 * Per spec/compiler.md, no prop reference transformation is needed:
 * - Destructured props are captured once at hydration, used as-is
 * - Props object already uses props.xxx syntax
 *
 * `scope` (#2482 Stage 1b): the enclosing loop row's `BindingScope`, when
 * `value` is being expanded from inside a `.map()` row. `ClientJsContext`
 * itself carries no loop-scope field — it's a per-component object, built
 * once and shared across the whole tree — so without this guard a loop
 * row binding (item / index / destructured / preamble local) that shares
 * a name with a component/module-level const resolves to the OUTER
 * const's value instead of staying an unresolved reference to the row's
 * own binding. `isBound` (not `valueBoundNames`) is the correct query —
 * this is a SHADOW GUARD (every binding source hides an outer same-named
 * const), not a reactivity classifier — see `BindingScope.valueBoundNames`'s
 * doc comment.
 */
export function expandDynamicPropValue(value: string, ctx: ClientJsContext, scope?: BindingScope): string {
  const trimmedValue = value.trim()
  if (scope?.isBound(trimmedValue)) return value

  const constant = ctx.localConstants.find((c) => c.name === trimmedValue)
  // A binding mutated after its declaration (#2910) has no compile-time
  // value — `constant.value` is a snapshot from BEFORE the mutation ran.
  // Re-embedding it here would silently drop the mutation; keep the bare
  // reference instead so the emitted getter reads the LIVE binding.
  if (constant?.mutatedAfterDeclaration) return value
  if (constant && constant.value) {
    return constant.value
  }

  return value
}

/**
 * Expand a local constant for reactivity detection in stateless components.
 * Stateful components use props.xxx directly, so expansion is unnecessary.
 *
 * e.g., `classes` → `` `${baseClasses} ${variantClasses[variant]} ${className}` ``
 *
 * Returns both the expanded expression and the free identifiers it
 * references (#1267). When expansion occurred, `freeIds` is the substituted
 * constant's own `freeIdentifiers` (already AST-computed in the analyzer).
 * Otherwise it is `originalFreeIds` passed by the caller (typically derived
 * from the IR node's `origin.freeRefs`) — `undefined` when the caller has
 * no precomputed set.
 *
 * `scope` (#2482 Stage 1b): see `expandDynamicPropValue` — same guard, same
 * reasoning. Without it, a loop row's own binding (bare identifier, e.g. a
 * `.map()` callback preamble local or the item param itself) that shares a
 * name with a component/module-level const gets const-folded into the
 * OUTER value here, which then corrupts BOTH the emitted expression AND
 * downstream reactivity classification (`classifyReactivity` sees a
 * literal instead of a live reference and concludes "not reactive" — the
 * observable failure mode is a reactive attribute/conditional that
 * silently freezes at its initial value instead of updating).
 */
export function expandConstantForReactivity(
  expr: string,
  ctx: ClientJsContext,
  originalFreeIds?: ReadonlySet<string>,
  scope?: BindingScope,
): { expr: string; freeIds: ReadonlySet<string> | undefined } {
  // Stateful components use props.xxx directly — reactivity is already detected.
  if (ctx.propsObjectName) return { expr, freeIds: originalFreeIds }

  const trimmedValue = expr.trim()
  if (scope?.isBound(trimmedValue)) return { expr, freeIds: originalFreeIds }

  const constant = ctx.localConstants.find((c) => c.name === trimmedValue)
  // See `expandDynamicPropValue`'s matching guard (#2910): a mutated
  // binding's `value` is a stale pre-mutation snapshot, so it must not be
  // substituted in place of a live reference.
  if (constant?.mutatedAfterDeclaration) return { expr, freeIds: originalFreeIds }
  if (constant && constant.value) {
    return { expr: constant.value, freeIds: constant.freeIdentifiers }
  }
  return { expr, freeIds: originalFreeIds }
}

/**
 * The prop a signal is controlled by: its initializer reads that declared
 * prop itself (not a member of it), bare or with a `??` / `||` fallback (`createSignal(props.checked)`,
 * `createSignal(value ?? 0)`), so a createEffect re-syncs it when the
 * parent's prop changes. Read from the analyzer's `SignalInfo.propSeed`, the
 * same field `resolveSignalInitialValue` reads, never from the text (#3508).
 *
 * Props starting with "default" (`defaultChecked`) are initial values, not
 * controlled props, and an async factory's value (`createQuery(fn, {
 * initial: props.posts })`, #3165) takes `initial` once, then comes from its
 * own requests.
 */
export function getControlledPropName(signal: SignalInfo): string | null {
  const seed = signal.propSeed
  if (signal.factory || !seed || seed.nested || !seed.declared) return null
  return seed.propName.startsWith('default') ? null : seed.propName
}

