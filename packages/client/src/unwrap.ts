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
 * Not an authoring API: emitted by the compiler where a prop may arrive as a
 * value or as a getter.
 *
 * @example
 * ```ts
 * // A prop arrives either as a plain value or as a getter (the compiler wraps
 * // reactive ones), so read it through unwrap() when either is possible.
 * unwrap('Save')        // 'Save'
 * unwrap(() => 'Save')  // 'Save'
 * ```
 *
 * @internal
 */
export function unwrap<T>(prop: T | (() => T)): T {
  return typeof prop === 'function' ? (prop as () => T)() : prop
}
