/**
 * BarefootJS - Element-based List Reconciliation
 *
 * Key-based DOM reconciliation for component-based list rendering.
 * Used when renderItem returns HTMLElement (via createComponent).
 */

import { hydratedScopes } from './hydration-state'
import { BF_SCOPE, BF_SLOT, BF_COND, BF_KEY, BF_LOOP_START, BF_LOOP_END } from './attrs'

/** Find loop boundary comment markers in a container. */
function findLoopMarkers(container: HTMLElement): { startMarker: Comment | null; endMarker: Comment | null } {
  let startMarker: Comment | null = null
  let endMarker: Comment | null = null
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue
      if (value === BF_LOOP_START) startMarker = node as Comment
      else if (value === BF_LOOP_END) endMarker = node as Comment
    }
  }
  if (startMarker && endMarker) return { startMarker, endMarker }
  return { startMarker: null, endMarker: null }
}

/** Get all Element nodes between start and end comment markers. */
function getElementsBetweenMarkers(start: Comment, end: Comment): Element[] {
  const elements: Element[] = []
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      elements.push(node as Element)
    }
    node = node.nextSibling
  }
  return elements
}

/** Remove all nodes between start and end comment markers (preserves the markers). */
function removeElementsBetweenMarkers(start: Comment, end: Comment): void {
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    const next: Node | null = node.nextSibling
    node.parentNode?.removeChild(node)
    node = next
  }
}

/**
 * Get loop children from a container, respecting bf-loop boundary markers.
 * When markers are present, returns only elements between them.
 * When absent, returns all children (backward compatible).
 * Exported for use by compiler-generated hydration code.
 */
export function getLoopChildren(container: HTMLElement): HTMLElement[] {
  const { startMarker, endMarker } = findLoopMarkers(container)
  if (startMarker && endMarker) {
    return getElementsBetweenMarkers(startMarker, endMarker) as HTMLElement[]
  }
  return Array.from(container.children) as HTMLElement[]
}

/**
 * Ensure loop boundary markers exist in a container for SSR-rendered content.
 * SSR HTML doesn't include markers, so we insert them during hydration.
 * Uses itemCount to identify the last N children as loop items (rest are siblings).
 */
export function ensureLoopMarkers(container: HTMLElement, itemCount: number): void {
  // Already has markers
  const { startMarker } = findLoopMarkers(container)
  if (startMarker) return

  const children = Array.from(container.children)
  if (children.length === 0) return

  // Loop items are the LAST itemCount children (siblings come first in HTML order)
  const loopStartIdx = Math.max(0, children.length - itemCount)
  const firstLoopChild = children[loopStartIdx]

  const start = document.createComment(BF_LOOP_START)
  const end = document.createComment(BF_LOOP_END)
  container.insertBefore(start, firstLoopChild)
  container.appendChild(end)
}

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

  // Find loop boundary markers if present.
  // When markers exist, only elements between <!--bf-loop--> and <!--/bf-loop-->
  // participate in reconciliation — siblings outside the range are preserved.
  const { startMarker, endMarker } = findLoopMarkers(container)

  // Collect existing keyed elements (only within loop range if markers exist)
  const existingByKey = new Map<string, HTMLElement>()
  let hasKeyedChildren = false
  const loopChildren = startMarker
    ? getElementsBetweenMarkers(startMarker, endMarker!)
    : Array.from(container.children)
  for (const child of loopChildren) {
    const el = child as HTMLElement
    const key = el.dataset?.key
    if (key !== undefined) {
      existingByKey.set(key, el)
      hasKeyedChildren = true
    }
  }

  // When no keyed children exist (initial SSR render or all-unkeyed container),
  // use the simple clear-and-replace path. Non-keyed children in this case are
  // SSR-rendered loop items that haven't been through hydration yet.
  if (!hasKeyedChildren) {
    if (items.length === 0) {
      if (startMarker) {
        removeElementsBetweenMarkers(startMarker, endMarker!)
      } else {
        container.innerHTML = ''
      }
      return
    }

    const fragment = document.createDocumentFragment()
    for (let i = 0; i < items.length; i++) {
      const el = (i === 0 && firstElement) ? firstElement : renderItem(items[i], i)
      const key = getKey ? getKey(items[i], i) : String(i)
      if (!el.dataset.key) el.setAttribute(BF_KEY, key)
      fragment.appendChild(el)
    }
    if (startMarker) {
      removeElementsBetweenMarkers(startMarker, endMarker!)
      endMarker!.parentNode!.insertBefore(fragment, endMarker)
    } else {
      container.innerHTML = ''
      container.appendChild(fragment)
    }
    return
  }

  // When loop markers exist, use end marker as insert point and remove only within range.
  // Otherwise, find boundary by walking children.
  let insertBefore: Node | null = endMarker ?? null
  if (!startMarker) {
    let foundKeyed = false
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).dataset.key !== undefined) {
        foundKeyed = true
      } else if (foundKeyed) {
        insertBefore = child
        break
      }
    }
  }

  // Remove old keyed elements (only within loop range if markers exist)
  for (const child of loopChildren) {
    if ((child as HTMLElement).dataset?.key !== undefined) {
      child.remove()
    }
  }

  if (items.length === 0) {
    return
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
          newEl.setAttribute(BF_KEY, key)
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
            tempEl.setAttribute(BF_KEY, key)
          }
          fragment.appendChild(tempEl)
        }
      }
    } else {
      // Create new element via renderItem (which calls createComponent)
      const el = createEl()
      if (!el.dataset.key) {
        el.setAttribute(BF_KEY, key)
      }
      fragment.appendChild(el)
    }
  }

  // Insert new keyed elements before non-keyed siblings
  container.insertBefore(fragment, insertBefore)
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
