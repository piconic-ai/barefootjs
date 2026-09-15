/**
 * BarefootJS - Forward Props Helper
 *
 * Forwards spread props to child components using getter delegation
 * to preserve reactivity. Used by compiler-generated code for
 * components with {...rest} spread on child components.
 */

/**
 * Create a props object that merges explicit overrides with forwarded source props.
 * Preserves getter-based reactivity from both overrides and source.
 *
 * @param source - The parent props object (reads are deferred via getters)
 * @param overrides - Object literal with getters/values that override source props
 * @param excludeKeys - Keys from source to exclude (already destructured)
 *
 * @since 0.1.0
 * @stability beta
 */
export function forwardProps<T extends Record<string, unknown>>(
  source: T,
  overrides: Record<string, unknown>,
  excludeKeys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const exclude = new Set(excludeKeys)

  // Copy overrides preserving getter descriptors
  const descs = Object.getOwnPropertyDescriptors(overrides)
  for (const key of Object.keys(descs)) {
    Object.defineProperty(result, key, { ...descs[key], enumerable: true, configurable: true })
  }

  // Forward remaining source props via getters (deferred read = reactive)
  for (const key of Object.keys(source)) {
    if (exclude.has(key) || key in result) continue
    const k = key
    Object.defineProperty(result, k, {
      get: () => (source as Record<string, unknown>)[k],
      enumerable: true,
      configurable: true,
    })
  }

  return result
}
