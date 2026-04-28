/**
 * BarefootJS - Element-based List Reconciliation
 *
 * Key-based DOM reconciliation for component-based list rendering.
 * Used when renderItem returns HTMLElement (via createComponent).
 */

import { hydratedScopes } from './hydration-state'
import { BF_SCOPE, BF_SLOT, BF_COND, BF_KEY, BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker } from '@barefootjs/shared'

/**
 * Find loop boundary comment markers in a container.
 *
 * `markerId` scopes the lookup to `<!--bf-loop:<id>-->` / `<!--bf-/loop:<id>-->`
 * so sibling loops under the same parent disambiguate (#1087). Without an id,
 * accepts the legacy unscoped form too — used by tests that build containers
 * without compiler-emitted markers.
 */
function findLoopMarkers(
  container: HTMLElement,
  markerId?: string,
): { startMarker: Comment | null; endMarker: Comment | null } {
  let startMarker: Comment | null = null
  let endMarker: Comment | null = null
  if (markerId) {
    const startVal = loopStartMarker(markerId)
    const endVal = loopEndMarker(markerId)
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue
      if (value === startVal) startMarker = node as Comment
      else if (value === endVal) endMarker = node as Comment
    }
  } else {
    const startPrefix = `${BF_LOOP_START}:`
    const endPrefix = `${BF_LOOP_END}:`
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue ?? ''
      if (!startMarker && (value === BF_LOOP_START || value.startsWith(startPrefix))) {
        startMarker = node as Comment
      } else if (!endMarker && (value === BF_LOOP_END || value.startsWith(endPrefix))) {
        endMarker = node as Comment
      }
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
export function getLoopChildren(container: HTMLElement, markerId?: string): HTMLElement[] {
  const { startMarker, endMarker } = findLoopMarkers(container, markerId)
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
export function ensureLoopMarkers(container: HTMLElement, itemCount: number, markerId?: string): void {
  // Already has markers
  const { startMarker } = findLoopMarkers(container, markerId)
  if (startMarker) return

  const children = Array.from(container.children)
  if (children.length === 0) return

  // Loop items are the LAST itemCount children (siblings come first in HTML order)
  const loopStartIdx = Math.max(0, children.length - itemCount)
  const firstLoopChild = children[loopStartIdx]

  const start = document.createComment(markerId ? loopStartMarker(markerId) : BF_LOOP_START)
  const end = document.createComment(markerId ? loopEndMarker(markerId) : BF_LOOP_END)
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
  firstElement?: HTMLElement,
  markerId?: string,
): void {
  if (!container || !items) return

  // Find loop boundary markers if present.
  // When markers exist, only elements between <!--bf-loop--> and <!--/bf-loop-->
  // participate in reconciliation — siblings outside the range are preserved.
  const { startMarker, endMarker } = findLoopMarkers(container, markerId)

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

  // Insert anchor: end marker (if present) or first non-keyed sibling after keyed region.
  let insertAnchor: Node | null = endMarker ?? null
  if (!startMarker) {
    let foundKeyed = false
    for (const child of Array.from(container.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).dataset.key !== undefined) {
        foundKeyed = true
      } else if (foundKeyed) {
        insertAnchor = child
        break
      }
    }
  }

  // --- Phase 1: Detect focus (before ANY DOM mutation) ---
  // Only text inputs have ongoing user state (cursor, selection, typed text)
  // that must survive reconciliation. Button focus has no state to preserve.
  let focusedKey: string | null = null
  const activeEl = document.activeElement
  if (activeEl && activeEl !== document.body) {
    const tag = activeEl.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (activeEl as HTMLElement).isContentEditable) {
      for (const [key, el] of existingByKey) {
        if (el.contains(activeEl)) {
          focusedKey = key
          break
        }
      }
    }
  }

  // --- Phase 2: Build desired element list ---
  // For each item, decide: reuse existing (focus), create new, or skip.
  // Track old elements to remove explicitly — no bulk remove-all.
  const desiredElements: HTMLElement[] = []
  const toRemove: Element[] = []
  let focusTarget: FocusTransferInfo | null = null

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const key = getKey ? getKey(item, i) : String(i)
    const createEl = () => (i === 0 && firstElement) ? firstElement : renderItem(item, i)

    const existing = existingByKey.get(key)
    if (existing) {
      existingByKey.delete(key)

      if (existing.getAttribute(BF_SCOPE) && !hydratedScopes.has(existing)) {
        // Uninitialized SSR element — replace with client-rendered element
        const newEl = createEl()
        if (!newEl.dataset.key) newEl.setAttribute(BF_KEY, key)
        desiredElements.push(newEl)
        toRemove.push(existing)
      } else if (focusedKey === key) {
        // Element contains a focused text input. Create the new element (with
        // updated inner loops, conditionals, etc.), copy input state now,
        // defer focus() to after DOM insertion to avoid flicker.
        const newEl = createEl()
        if (!newEl.dataset.key) newEl.setAttribute(BF_KEY, key)
        focusTarget = prepareInputTransfer(existing, newEl)
        desiredElements.push(newEl)
        toRemove.push(existing)
      } else {
        // Normal update — use new element
        const newEl = createEl()
        if (!newEl.dataset.key) newEl.setAttribute(BF_KEY, key)
        desiredElements.push(newEl)
        toRemove.push(existing)
      }
    } else {
      // Brand new key
      const el = createEl()
      if (!el.dataset.key) el.setAttribute(BF_KEY, key)
      desiredElements.push(el)
    }
  }

  // Remaining entries in existingByKey are orphans (key no longer in items)
  for (const el of existingByKey.values()) {
    toRemove.push(el)
  }

  // --- Phase 3: Remove old elements ---
  for (const el of toRemove) {
    if (el.parentNode) el.remove()
  }

  // --- Phase 4: Insert/move desired elements in correct order ---
  // insertBefore moves already-connected elements; inserts new ones.
  for (const el of desiredElements) {
    container.insertBefore(el, insertAnchor)
  }

  // --- Phase 5: Restore focus synchronously (element is now in DOM) ---
  if (focusTarget) {
    focusTarget.target.focus()
    if (typeof focusTarget.selectionStart === 'number') {
      focusTarget.target.selectionStart = focusTarget.selectionStart
      focusTarget.target.selectionEnd = focusTarget.selectionEnd
    }
  }
}

interface FocusTransferInfo {
  target: HTMLInputElement
  selectionStart: number | null
  selectionEnd: number | null
}

/**
 * Prepare focus transfer: copy value + selection state from old focused input
 * to the matching input in newEl. Returns info needed to call focus() later
 * (after the new element is inserted into the DOM).
 */
function prepareInputTransfer(oldEl: HTMLElement, newEl: HTMLElement): FocusTransferInfo | null {
  const focused = oldEl.contains(document.activeElement) ? document.activeElement as HTMLInputElement : null
  if (!focused) return null

  const tag = focused.tagName
  const oldInputs = Array.from(oldEl.querySelectorAll(tag))
  const idx = oldInputs.indexOf(focused)
  if (idx < 0) return null

  const newInputs = Array.from(newEl.querySelectorAll(tag)) as HTMLInputElement[]
  const target = newInputs[idx]
  if (!target) return null

  target.value = focused.value
  return {
    target,
    selectionStart: focused.selectionStart,
    selectionEnd: focused.selectionEnd,
  }
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
