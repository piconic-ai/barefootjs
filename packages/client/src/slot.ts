/**
 * Slot marker for JSX props that contain components.
 *
 * When a caller passes `<Button />` inside a JSX prop, the compiler wraps
 * the value with `__slot()`. The callee's text effect checks `__isSlot`
 * and skips the destructive `nodeValue = String(...)` update, preserving
 * the server-rendered DOM for hydration.
 */

/**
 * Marker object `__slot` wraps component-valued props in.
 *
 * @since 0.1.0
 * @internal
 */
export interface SlotMarker {
  __isSlot: true
  toString(): string
}

/**
 * @since 0.1.0
 * @internal
 */
export function __slot(thunk: () => unknown): SlotMarker {
  return {
    __isSlot: true,
    toString() {
      const result = thunk()
      return result == null ? '' : String(result)
    },
  }
}
