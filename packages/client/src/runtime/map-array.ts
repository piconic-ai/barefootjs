/**
 * BarefootJS - Per-Item Reactive List Rendering
 *
 * Maps a reactive array to DOM elements with per-item scoping.
 * Each item is rendered in its own createRoot with a per-item signal.
 * When the array changes, same-key items UPDATE their signal instead of
 * being disposed and recreated — fine-grained effects handle DOM updates.
 *
 * Unified CSR/SSR: renderItem receives an optional existing element.
 * For SSR hydration, the existing DOM element is passed so renderItem
 * can initialize it (initChild) instead of creating a new one (createComponent).
 */

import { createSignal, createEffect, createRoot } from '@barefootjs/client/reactive'
import { hydratedScopes } from './hydration-state'
import { BF_KEY, BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker } from '@barefootjs/shared'

type ItemScope<T> = {
  element: HTMLElement
  dispose: () => void
  setItem: (v: T) => void
}

/**
 * Find loop boundary comment markers in a container.
 *
 * When `markerId` is given, matches the scoped form `<!--bf-loop:<id>-->` /
 * `<!--bf-/loop:<id>-->` so sibling `.map()` calls under the same parent
 * each see only their own range (#1087).
 *
 * When omitted (e.g. hand-written tests that drop in unscoped markers),
 * falls back to the first start / first end found, matching either the
 * scoped or legacy unscoped form.
 */
function findLoopMarkers(
  container: HTMLElement,
  markerId?: string,
): { start: Comment | null; end: Comment | null } {
  let start: Comment | null = null
  let end: Comment | null = null
  if (markerId) {
    const startVal = loopStartMarker(markerId)
    const endVal = loopEndMarker(markerId)
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue
      if (value === startVal) start = node as Comment
      else if (value === endVal) end = node as Comment
    }
  } else {
    const startPrefix = `${BF_LOOP_START}:`
    const endPrefix = `${BF_LOOP_END}:`
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue ?? ''
      if (!start && (value === BF_LOOP_START || value.startsWith(startPrefix))) {
        start = node as Comment
      } else if (!end && (value === BF_LOOP_END || value.startsWith(endPrefix))) {
        end = node as Comment
      }
    }
  }
  if (start && end) return { start, end }
  return { start: null, end: null }
}

/** Get element nodes between markers. */
function elementsBetween(start: Comment, end: Comment): HTMLElement[] {
  const els: HTMLElement[] = []
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    if (node.nodeType === Node.ELEMENT_NODE) els.push(node as HTMLElement)
    node = node.nextSibling
  }
  return els
}

/**
 * Create an item in its own reactive scope with a per-item signal.
 * renderItem receives a signal accessor for the item, so fine-grained
 * effects can re-run when the item signal is updated via setItem().
 */
function createItemScope<T>(
  item: T,
  index: number,
  renderItem: (item: () => T, index: number, existing?: HTMLElement) => HTMLElement,
  existing?: HTMLElement,
): ItemScope<T> {
  let element!: HTMLElement
  let dispose!: () => void
  let setItem!: (v: T) => void

  createRoot((d) => {
    dispose = d
    const [itemAccessor, itemSetter] = createSignal(item)
    setItem = itemSetter
    element = renderItem(itemAccessor, index, existing)
    return undefined
  })

  return { element, dispose, setItem }
}

/**
 * Per-item scoped list rendering.
 *
 * @param accessor - Function returning the reactive array (signal/memo read)
 * @param container - DOM container element
 * @param getKey - Key extractor (null = use index). Receives plain item value.
 * @param renderItem - Creates or initializes an HTMLElement for an item (runs in createRoot).
 *                     Receives item as signal accessor: item() returns current value.
 *                     When `existing` is passed, initializes the SSR-rendered element and returns it.
 *                     When `existing` is undefined, creates a new element and returns it.
 */
export function mapArray<T>(
  accessor: () => T[],
  container: HTMLElement | null,
  getKey: ((item: T, index: number) => string) | null,
  renderItem: (item: () => T, index: number, existing?: HTMLElement) => HTMLElement,
  markerId?: string,
): void {
  if (!container) return

  const scopes = new Map<string, ItemScope<T>>()
  let hydrated = false

  createEffect(() => {
    const items = accessor()
    if (!items) return

    const { start: startMarker, end: endMarker } = findLoopMarkers(container, markerId)
    const anchor = endMarker ?? null

    // --- First run: hydrate SSR-rendered children ---
    if (!hydrated) {
      hydrated = true
      const existingChildren = startMarker
        ? elementsBetween(startMarker, endMarker!)
        : Array.from(container.children) as HTMLElement[]

      // SSR elements need initialization when they haven't been adopted into scopes yet.
      // Check both: elements without data-key (legacy) OR elements with data-key but no scopes
      // (component loops render data-key in SSR template but haven't been hydrated).
      const needsHydration = existingChildren.length > 0
        && (!existingChildren[0]?.hasAttribute('data-key') || scopes.size === 0)
      if (needsHydration) {
        // Hydrate in place: tag keys, create per-item scopes with renderItem(existing)
        for (let i = 0; i < existingChildren.length && i < items.length; i++) {
          const child = existingChildren[i]
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          child.setAttribute(BF_KEY, key)

          const scope = createItemScope(item, i, renderItem, child)
          scopes.set(key, scope)
          hydratedScopes.add(child)
        }

        // If SSR had fewer items than current array, create remaining (CSR)
        for (let i = existingChildren.length; i < items.length; i++) {
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          const scope = createItemScope(item, i, renderItem)
          if (!scope.element.dataset.key) scope.element.setAttribute(BF_KEY, key)
          scopes.set(key, scope)
          container.insertBefore(scope.element, anchor)
        }
        return  // Hydration complete — effects handle future updates
      }
    }

    // --- Adopt any existing keyed elements not yet in scopes ---
    if (scopes.size === 0) {
      const loopChildren = startMarker
        ? elementsBetween(startMarker, endMarker!)
        : Array.from(container.children) as HTMLElement[]
      for (const child of loopChildren) {
        const existingKey = (child as HTMLElement).dataset?.key
        if (existingKey && !scopes.has(existingKey)) {
          scopes.set(existingKey, {
            element: child as HTMLElement,
            dispose: () => {},
            setItem: () => {},
          })
        }
      }
    }

    // --- Key-based diff ---
    const newKeys = new Set<string>()
    const desiredOrder: { key: string; element: HTMLElement }[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey ? getKey(item, i) : String(i)
      newKeys.add(key)

      const existing = scopes.get(key)
      if (existing) {
        // Same key: update per-item signal — fine-grained effects handle DOM updates.
        // Element is preserved (no dispose, no re-render).
        existing.setItem(item)
        desiredOrder.push({ key, element: existing.element })
      } else {
        // New item: create in isolated scope
        const scope = createItemScope(item, i, renderItem)
        if (!scope.element.dataset.key) scope.element.setAttribute(BF_KEY, key)
        scopes.set(key, scope)
        desiredOrder.push({ key, element: scope.element })
      }
    }

    // Remove items no longer in the array
    for (const [key, scope] of scopes) {
      if (!newKeys.has(key)) {
        scope.dispose()
        if (scope.element.parentNode) scope.element.remove()
        scopes.delete(key)
      }
    }

    // Reconcile DOM order: skip insertBefore entirely when order is unchanged.
    // Moving elements via insertBefore causes detach/reattach which makes
    // focused inputs lose focus (controlled input flicker).
    let inOrder = true
    let checkNode: Node | null = startMarker ? startMarker.nextSibling : container.firstChild
    for (const { element } of desiredOrder) {
      // Skip non-element nodes (comments, text)
      while (checkNode && checkNode.nodeType !== Node.ELEMENT_NODE) checkNode = checkNode.nextSibling
      if (checkNode !== element) { inOrder = false; break }
      checkNode = checkNode.nextSibling
    }
    if (!inOrder) {
      for (const { element } of desiredOrder) {
        container.insertBefore(element, anchor)
      }
    }
  })
}
