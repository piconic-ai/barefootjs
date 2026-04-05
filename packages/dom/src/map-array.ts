/**
 * BarefootJS - Per-Item Reactive List Rendering
 *
 * Maps a reactive array to DOM elements with per-item scoping.
 * Each item is rendered in its own createRoot with a per-item signal.
 * When the array changes, same-key items UPDATE their signal instead of
 * being disposed and recreated — fine-grained effects handle DOM updates.
 */

import { createSignal, createEffect, createRoot } from './reactive'
import { hydratedScopes } from './hydration-state'
import { BF_KEY, BF_LOOP_START, BF_LOOP_END } from './attrs'

type ItemScope<T> = {
  element: HTMLElement
  dispose: () => void
  setItem: (v: T) => void
}

/** Find loop boundary comment markers in a container. */
function findLoopMarkers(container: HTMLElement): { start: Comment | null; end: Comment | null } {
  let start: Comment | null = null
  let end: Comment | null = null
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType === Node.COMMENT_NODE) {
      const value = (node as Comment).nodeValue
      if (value === BF_LOOP_START) start = node as Comment
      else if (value === BF_LOOP_END) end = node as Comment
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
  renderItem: (item: () => T, index: number) => HTMLElement,
): ItemScope<T> {
  let element!: HTMLElement
  let dispose!: () => void
  let setItem!: (v: T) => void

  createRoot((d) => {
    dispose = d
    const [itemAccessor, itemSetter] = createSignal(item)
    setItem = itemSetter
    element = renderItem(itemAccessor, index)
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
 * @param renderItem - Creates an HTMLElement for a new item (runs in createRoot).
 *                     Receives item as signal accessor: item() returns current value.
 * @param onHydrate - Optional callback for SSR hydration setup per existing child.
 *                    Receives item as signal accessor.
 */
export function mapArray<T>(
  accessor: () => T[],
  container: HTMLElement | null,
  getKey: ((item: T, index: number) => string) | null,
  renderItem: (item: () => T, index: number) => HTMLElement,
  onHydrate?: (child: HTMLElement, item: () => T, index: number) => void,
): void {
  if (!container) return

  const scopes = new Map<string, ItemScope<T>>()
  let hydrated = false

  createEffect(() => {
    const items = accessor()
    if (!items) return

    const { start: startMarker, end: endMarker } = findLoopMarkers(container)
    const anchor = endMarker ?? null

    // --- First run: hydrate SSR-rendered children ---
    if (!hydrated) {
      hydrated = true
      const existingChildren = startMarker
        ? elementsBetween(startMarker, endMarker!)
        : Array.from(container.children) as HTMLElement[]

      // SSR elements without data-key need initialization.
      if (existingChildren.length > 0 && !existingChildren[0]?.hasAttribute('data-key')) {
        if (onHydrate) {
          // Hydrate in place: tag keys, create per-item scopes with signals
          for (let i = 0; i < existingChildren.length && i < items.length; i++) {
            const child = existingChildren[i]
            const item = items[i]
            const key = getKey ? getKey(item, i) : String(i)
            child.setAttribute(BF_KEY, key)

            let dispose!: () => void
            let setItem!: (v: T) => void
            createRoot((d) => {
              dispose = d
              const [itemAccessor, itemSetter] = createSignal(item)
              setItem = itemSetter
              onHydrate(child, itemAccessor, i)
              return undefined
            })

            scopes.set(key, { element: child, dispose, setItem })
            hydratedScopes.add(child)
          }

          // If SSR had fewer items than current array, create remaining
          for (let i = existingChildren.length; i < items.length; i++) {
            const item = items[i]
            const key = getKey ? getKey(item, i) : String(i)
            const scope = createItemScope(item, i, renderItem)
            if (!scope.element.dataset.key) scope.element.setAttribute(BF_KEY, key)
            scopes.set(key, scope)
            container.insertBefore(scope.element, anchor)
          }
          return  // Hydration complete — effects handle future updates
        } else {
          // No hydration callback — remove SSR placeholders and fall through
          for (const child of existingChildren) child.remove()
        }
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

    // Reconcile DOM order: insertBefore moves already-connected elements
    for (const { element } of desiredOrder) {
      container.insertBefore(element, anchor)
    }
  })
}
