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
  if (constant && constant.value) {
    return { expr: constant.value, freeIds: constant.freeIdentifiers }
  }
  return { expr, freeIds: originalFreeIds }
}

/**
 * Check if a signal is initialized from a prop value (controlled signal pattern).
 * Returns the prop name if the signal's initial value references a prop, null otherwise.
 *
 * Detects patterns like:
 *   const [controlledChecked, setControlledChecked] = createSignal(props.checked)
 *   const [controlledValue, setControlledValue] = createSignal(value)
 *
 * These signals need a createEffect to sync with parent's prop changes.
 *
 * Note: Props starting with "default" (e.g., defaultChecked, defaultValue) are
 * excluded as they are initial values, not controlled props.
 */
export function getControlledPropName(
  signal: SignalInfo,
  propsParams: ParamInfo[],
  propsObjectName: string | null = null
): string | null {
  const initialValue = signal.initialValue.trim()
  const isDefaultProp = (propName: string) => propName.startsWith('default')
  // Use the source-level props name for pattern matching (not the generated PROPS_PARAM)
  const propsName = propsObjectName ?? 'props'

  // Direct <propsName>.X reference, optionally with ?? or || fallback
  // e.g., props.checked, p.value ?? 0, props.initial || ''
  const propsPattern = new RegExp(`^${propsName}\\.(\\w+)(?:\\s*(?:\\?\\?|\\|\\|)\\s*.+)?$`)
  const propsMatch = initialValue.match(propsPattern)
  if (propsMatch) {
    const propName = propsMatch[1]
    if (propsParams.some((p) => p.name === propName) && !isDefaultProp(propName)) {
      return propName
    }
  }

  // Simple prop name (e.g., checked in createSignal(checked))
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(initialValue)) {
    if (propsParams.some((p) => p.name === initialValue) && !isDefaultProp(initialValue)) {
      return initialValue
    }
  }

  // Prop with nullish coalescing or logical OR fallback
  // e.g., checked ?? false, props.checked ?? false, p.value || ''
  const fallbackPattern = new RegExp(`^(?:${propsName}\\.)?(\\w+)\\s*(?:\\?\\?|\\|\\|)\\s*.+$`)
  const fallbackMatch = initialValue.match(fallbackPattern)
  if (fallbackMatch) {
    const propName = fallbackMatch[1]
    if (propsParams.some((p) => p.name === propName) && !isDefaultProp(propName)) {
      return propName
    }
  }

  return null
}

