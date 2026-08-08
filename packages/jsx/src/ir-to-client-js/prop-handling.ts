/**
 * Props expansion, dependency analysis, and controlled component detection.
 */

import type { ParamInfo, SignalInfo } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import type { BindingScope } from '../scope/binding-scope.ts'

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

