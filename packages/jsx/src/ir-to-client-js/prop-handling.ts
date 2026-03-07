/**
 * Props expansion, dependency analysis, and controlled component detection.
 */

import type { ConstantInfo, ParamInfo, SignalInfo } from '../types'
import type { ClientJsContext } from './types'
import { PROPS_PARAM } from './utils'

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
 * Check if a value references reactive data (props, signals, or memos).
 */
export function valueReferencesReactiveData(
  value: string,
  ctx: ClientJsContext
): { usesProps: boolean; usedProps: string[]; usesSignals: boolean; usesMemos: boolean } {
  const usedProps: string[] = []
  let usesSignals = false
  let usesMemos = false

  for (const prop of ctx.propsParams) {
    if (new RegExp(`\\b${prop.name}\\b`).test(value)) {
      usedProps.push(prop.name)
    }
  }

  for (const signal of ctx.signals) {
    if (new RegExp(`\\b${signal.getter}\\s*\\(`).test(value)) {
      usesSignals = true
    }
  }

  for (const memo of ctx.memos) {
    if (new RegExp(`\\b${memo.name}\\s*\\(`).test(value)) {
      usesMemos = true
    }
  }

  return {
    usesProps: usedProps.length > 0,
    usedProps,
    usesSignals,
    usesMemos,
  }
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

/**
 * Detect props that are used with property access (e.g., highlightedCommands.pnpm).
 * These props need a default value of {} to avoid "cannot read properties of undefined".
 */
export function detectPropsWithPropertyAccess(
  ctx: ClientJsContext,
  neededConstants: ConstantInfo[]
): Set<string> {
  const result = new Set<string>()
  const sources: string[] = []

  for (const elem of ctx.conditionalElements) {
    sources.push(elem.whenTrueHtml, elem.whenFalseHtml, elem.condition)
  }
  for (const elem of ctx.loopElements) {
    sources.push(elem.template)
  }
  for (const elem of ctx.dynamicElements) {
    sources.push(elem.expression)
  }
  for (const constant of neededConstants) {
    if (constant.value) sources.push(constant.value)
  }

  for (const prop of ctx.propsParams) {
    const dotPattern = new RegExp(`\\b${prop.name}\\.[a-zA-Z_]`)
    const bracketPattern = new RegExp(`\\b${prop.name}\\s*\\[`)

    for (const source of sources) {
      if (dotPattern.test(source) || bracketPattern.test(source)) {
        result.add(prop.name)
        break
      }
    }
  }

  return result
}
