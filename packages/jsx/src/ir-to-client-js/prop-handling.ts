/**
 * Props expansion, dependency analysis, and controlled component detection.
 */

import type { ParamInfo, SignalInfo } from '../types'
import type { ClientJsContext } from './types'

/**
 * Expand dynamic prop value by resolving local constants.
 *
 * Per spec/compiler.md, no prop reference transformation is needed:
 * - Destructured props are captured once at hydration, used as-is
 * - Props object already uses props.xxx syntax
 */
export function expandDynamicPropValue(value: string, ctx: ClientJsContext): string {
  const trimmedValue = value.trim()

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
 */
export function expandConstantForReactivity(expr: string, ctx: ClientJsContext): string {
  // Stateful components use props.xxx directly — reactivity is already detected.
  if (ctx.propsObjectName) return expr

  return expandDynamicPropValue(expr, ctx)
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

