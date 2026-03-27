/**
 * BarefootJS - Element-based List Reconciliation
 *
 * Key-based DOM reconciliation for component-based list rendering.
 * Used when renderItem returns HTMLElement (via createComponent).
 */

import { hydratedScopes } from './hydration-state'
import { BF_SCOPE, BF_SLOT, BF_COND } from './attrs'

/**
 * Reconcile a list container using HTMLElement mode (for createComponent).
 * Reuses existing elements by key, creates new elements as needed.
 *
 * @param container - The parent element containing list items
 * @param items - Array of items to render
 * @param getKey - Function to extract a unique key from each item (or null to use index)
 * @param renderItem - Function that returns an HTMLElement for each item
 * @param firstElement - Pre-created element for first item (avoids duplicate creation when caller already rendered item 0)
 */
export function reconcileElements<T>(
  container: HTMLElement | null,
  items: T[],
  getKey: ((item: T, index: number) => string) | null,
  renderItem: (item: T, index: number) => HTMLElement,
  firstElement?: HTMLElement
): void {
  if (!container || !items) return

  if (items.length === 0) {
    container.innerHTML = ''
    return
  }

  // Build key -> element map from existing children
  const existingByKey = new Map<string, HTMLElement>()
  for (const child of Array.from(container.children)) {
    const el = child as HTMLElement
    const key = el.dataset.key
    if (key !== undefined) {
      existingByKey.set(key, el)
    }
  }

  const fragment = document.createDocumentFragment()

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = getKey ? getKey(item, i) : String(i)

    const createEl = () => (i === 0 && firstElement) ? firstElement : renderItem(item, i)

    if (existingByKey.has(key)) {
      // An element with this key already exists
      const existingEl = existingByKey.get(key)!
      existingByKey.delete(key)

      // Check if this is an uninitialized SSR element
      if (existingEl.getAttribute(BF_SCOPE) && !hydratedScopes.has(existingEl)) {
        // For SSR elements, create new element with proper initialization
        const newEl = createEl()
        if (!newEl.dataset.key) {
          newEl.setAttribute('data-key', key)
        }
        fragment.appendChild(newEl)
      } else {
        // Element is already initialized - decide whether to sync or replace
        const hasFocus = existingEl.contains(document.activeElement)

        if (hasFocus) {
          // Preserve existing element to maintain focus state.
          // Re-render a temporary element to extract updated attribute state,
          // then sync attributes from the temp to the existing element.
          // TODO: createEl() creates a full component instance with reactive effects.
          // The tempEl is never added to DOM, but its effects remain subscribed to
          // signals until GC collects them. A proper fix requires scope-level disposal.
          const tempEl = createEl()
          syncElementState(existingEl, tempEl)
          fragment.appendChild(existingEl)
        } else {
          // No focus to preserve - use the temp element directly
          const tempEl = createEl()
          if (!tempEl.dataset.key) {
            tempEl.setAttribute('data-key', key)
          }
          fragment.appendChild(tempEl)
        }
      }
    } else {
      // Create new element via renderItem (which calls createComponent)
      const el = createEl()
      if (!el.dataset.key) {
        el.setAttribute('data-key', key)
      }
      fragment.appendChild(el)
    }
  }

  // Clear container and append - unused elements are removed
  container.innerHTML = ''
  container.appendChild(fragment)
}

/**
 * Sync reactive DOM state from a source element to a target element.
 * Copies class names, replaces conditional elements, and syncs text content.
 */
export function syncElementState(target: HTMLElement, source: HTMLElement): void {
  // Sync class list (for reactive classes like 'done' on TodoItem)
  target.className = source.className

  // First, sync conditional elements by replacing them entirely
  const sourceCondSlots = Array.from(source.querySelectorAll(`[${BF_COND}]`))
  for (const sourceCondSlot of sourceCondSlots) {
    const condId = (sourceCondSlot as HTMLElement).getAttribute(BF_COND)
    if (condId) {
      const targetCondSlot = target.querySelector(`[${BF_COND}="${condId}"]`)
      if (targetCondSlot) {
        targetCondSlot.replaceWith(sourceCondSlot)
      }
    }
  }

  // Then sync text content of bf slots that are NOT inside conditional elements.
  // Use querySelectorAll on BOTH source and target, then match by position index
  // within each slot ID group. This handles multiple component instances that share
  // the same internal slot ID (e.g., multiple Badge components each with bf="s0").
  const sourceSlots = source.querySelectorAll(`[${BF_SLOT}]`)
  const targetSlotsByID = new Map<string, Element[]>()
  const targetAllSlots = target.querySelectorAll(`[${BF_SLOT}]`)
  for (const targetSlot of Array.from(targetAllSlots)) {
    const id = (targetSlot as HTMLElement).getAttribute(BF_SLOT)
    if (id) {
      if (!targetSlotsByID.has(id)) targetSlotsByID.set(id, [])
      targetSlotsByID.get(id)!.push(targetSlot)
    }
  }

  // Track which index we're at for each slot ID
  const slotIndexCounters = new Map<string, number>()

  for (const sourceSlot of Array.from(sourceSlots)) {
    const slotId = (sourceSlot as HTMLElement).getAttribute(BF_SLOT)
    if (slotId) {
      if (sourceSlot.closest(`[${BF_COND}]`)) continue
      const idx = slotIndexCounters.get(slotId) ?? 0
      slotIndexCounters.set(slotId, idx + 1)
      const targets = targetSlotsByID.get(slotId)
      const targetSlot = targets?.[idx]
      if (targetSlot && sourceSlot.textContent !== null) {
        if (sourceSlot.children.length === 0) {
          targetSlot.textContent = sourceSlot.textContent
        }
      }
    }
  }
}
