/**
 * BarefootJS - Unwrap Utility
 *
 * Unwrap a prop value that may be a getter function.
 * When props are passed from parent to child components, reactive values
 * are wrapped as getter functions to maintain reactivity.
 * This helper unwraps them transparently.
 */

/**
 * Unwrap a prop value that may be a getter function.
 *
 * @param prop - The prop value (may be a value or a getter function)
 * @returns The unwrapped value
 *
 * @since 0.1.0
 * @stability beta
 */
export function unwrap<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop
}
