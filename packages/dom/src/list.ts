/**
 * BarefootJS - List Reconciliation
 *
 * Key-based DOM reconciliation for efficient list updates.
 * Delegates to reconcileElements for element-based rendering.
 */

import { reconcileElements } from './reconcile-elements'

/**
 * Render function type for list items.
 * Returns an HTMLElement for each item.
 */
export type RenderItemFn<T> = (item: T, index: number) => HTMLElement

/**
 * Reconcile a list container with new items using key-based matching.
 *
 * @param container - The parent element containing list items
 * @param items - Array of items to render
 * @param getKey - Function to extract a unique key from each item (or null to use index)
 * @param renderItem - Function to render an item as HTMLElement
 */
export function reconcileList<T>(
  container: HTMLElement | null,
  items: T[],
  getKey: ((item: T, index: number) => string) | null,
  renderItem: RenderItemFn<T>
): void {
  if (!container || !items) return

  if (items.length === 0) {
    container.innerHTML = ''
    return
  }

  // Pre-create first element to avoid duplicate creation inside reconcileElements
  const firstElement = renderItem(items[0], 0)

  reconcileElements(
    container,
    items,
    getKey,
    renderItem,
    firstElement
  )
}
