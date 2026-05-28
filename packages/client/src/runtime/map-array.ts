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
 *
 * Multi-root items (#1212): when the loop body is a JSX Fragment with two
 * or more sibling elements, the compiler emits a `<!--bf-loop-i-->`
 * comment before each item's roots. This module partitions the loop range
 * by those markers so one logical item — the (startMarker, primaryEl,
 * extras...) triple — moves, mounts, and unmounts as a single unit.
 * Single-root loops continue to flow through the legacy path verbatim.
 */

import { createSignal, createEffect, createRoot } from '@barefootjs/client/reactive'
import { hydratedScopes } from './hydration-state'
import {
  BF_KEY,
  BF_LOOP_START,
  BF_LOOP_END,
  BF_LOOP_ITEM,
  loopStartMarker,
  loopEndMarker,
} from '@barefootjs/shared'

type ItemScope<T> = {
  /**
   * `<!--bf-loop-i-->` Comment that anchors a multi-root item. `null` for
   * single-root items — keeps the common path mutation-equivalent to the
   * legacy implementation.
   */
  startMarker: Comment | null
  /**
   * The first real Element of the item — what `renderItem` returned and
   * what reactive effects, event delegation, and `qsa` lookups operate
   * on. Always present; multi-root items also carry `extras`.
   */
  primaryEl: HTMLElement
  /**
   * Additional sibling root elements for multi-root items (Fragment with
   * two or more peers). Empty for single-root items.
   */
  extras: HTMLElement[]
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

/**
 * Partition the nodes between loop boundary markers into one entry per
 * logical item. When `<!--bf-loop-i-->` markers are present, each marker
 * opens a new item range and the following Element nodes become its
 * `primaryEl` (first) and `extras` (subsequent). When no per-item markers
 * are present (single-root loops, the common case), each Element forms
 * its own range with `startMarker: null` and `extras: []` — preserving
 * legacy behavior verbatim.
 */
function findItemRanges(start: Comment, end: Comment): Array<{
  startMarker: Comment | null
  primaryEl: HTMLElement
  extras: HTMLElement[]
}> {
  const ranges: Array<{
    startMarker: Comment | null
    primaryEl: HTMLElement | null
    extras: HTMLElement[]
  }> = []
  let current: { startMarker: Comment | null; primaryEl: HTMLElement | null; extras: HTMLElement[] } | null = null
  let sawItemMarker = false
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    if (node.nodeType === Node.COMMENT_NODE && (node as Comment).nodeValue === BF_LOOP_ITEM) {
      sawItemMarker = true
      current = { startMarker: node as Comment, primaryEl: null, extras: [] }
      ranges.push(current)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (sawItemMarker) {
        if (!current!.primaryEl) current!.primaryEl = el
        else current!.extras.push(el)
      } else {
        ranges.push({ startMarker: null, primaryEl: el, extras: [] })
      }
    }
    node = node.nextSibling
  }
  return ranges.filter(
    (r): r is { startMarker: Comment | null; primaryEl: HTMLElement; extras: HTMLElement[] } =>
      r.primaryEl !== null,
  )
}

/**
 * Insert a scope's nodes into the container in their canonical order
 * (startMarker → primaryEl → extras). Idempotent — `insertBefore` on a
 * node already at the target position is a no-op.
 */
function insertScope<T>(scope: ItemScope<T>, container: HTMLElement, anchor: Node | null): void {
  if (scope.startMarker) container.insertBefore(scope.startMarker, anchor)
  container.insertBefore(scope.primaryEl, anchor)
  for (const ex of scope.extras) container.insertBefore(ex, anchor)
}

/** Detach all of a scope's nodes from the DOM. */
function removeScope<T>(scope: ItemScope<T>): void {
  if (scope.startMarker?.parentNode) scope.startMarker.remove()
  if (scope.primaryEl.parentNode) scope.primaryEl.remove()
  for (const ex of scope.extras) {
    if (ex.parentNode) ex.remove()
  }
}

/**
 * Create an item in its own reactive scope with a per-item signal.
 * renderItem receives a signal accessor for the item, so fine-grained
 * effects can re-run when the item signal is updated via setItem().
 *
 * Multi-root handling: on CSR the emitted renderItem stashes any extra
 * sibling roots on the returned element via a `__bfExtras` property that
 * we read-and-delete here. On hydration the caller passes `existingExtras`
 * + `existingStart` collected from the SSR partition.
 */
function createItemScope<T>(
  item: T,
  index: number,
  renderItem: (item: () => T, index: number, existing?: HTMLElement) => HTMLElement,
  existingPrimary?: HTMLElement,
  existingExtras?: HTMLElement[],
  existingStart?: Comment | null,
): ItemScope<T> {
  let primaryEl!: HTMLElement
  let dispose!: () => void
  let setItem!: (v: T) => void
  let extras: HTMLElement[] = []
  let startMarker: Comment | null = null

  createRoot((d) => {
    dispose = d
    const [itemAccessor, itemSetter] = createSignal(item)
    setItem = itemSetter
    primaryEl = renderItem(itemAccessor, index, existingPrimary)
    if (existingPrimary) {
      extras = existingExtras ?? []
      startMarker = existingStart ?? null
    } else {
      const stashed = (primaryEl as unknown as { __bfExtras?: HTMLElement[] }).__bfExtras
      if (stashed && stashed.length > 0) {
        extras = stashed
        startMarker = document.createComment(BF_LOOP_ITEM)
      }
      delete (primaryEl as unknown as { __bfExtras?: HTMLElement[] }).__bfExtras
    }
    return undefined
  })

  return { startMarker, primaryEl, extras, dispose, setItem }
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
      const existingRanges = startMarker
        ? findItemRanges(startMarker, endMarker!)
        : Array.from(container.children).map(
            (el) => ({ startMarker: null, primaryEl: el as HTMLElement, extras: [] as HTMLElement[] }),
          )

      // SSR elements need initialization when they haven't been adopted into scopes yet.
      // Check both: elements without data-key (legacy) OR elements with data-key but no scopes
      // (component loops render data-key in SSR template but haven't been hydrated).
      const needsHydration = existingRanges.length > 0
        && (!existingRanges[0]?.primaryEl.hasAttribute('data-key') || scopes.size === 0)
      if (needsHydration) {
        // Hydrate in place: tag keys, create per-item scopes with renderItem(existing)
        for (let i = 0; i < existingRanges.length && i < items.length; i++) {
          const range = existingRanges[i]
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          range.primaryEl.setAttribute(BF_KEY, key)

          const scope = createItemScope(
            item,
            i,
            renderItem,
            range.primaryEl,
            range.extras,
            range.startMarker,
          )
          scopes.set(key, scope)
          hydratedScopes.add(range.primaryEl)
        }

        // If SSR had fewer items than current array, create remaining (CSR)
        for (let i = existingRanges.length; i < items.length; i++) {
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          const scope = createItemScope(item, i, renderItem)
          if (!scope.primaryEl.dataset.key) scope.primaryEl.setAttribute(BF_KEY, key)
          scopes.set(key, scope)
          insertScope(scope, container, anchor)
        }

        // If client has fewer items than SSR rendered, remove orphaned nodes
        for (let i = items.length; i < existingRanges.length; i++) {
          const range = existingRanges[i]
          if (range.startMarker?.parentNode) range.startMarker.remove()
          if (range.primaryEl.parentNode) range.primaryEl.remove()
          for (const ex of range.extras) {
            if (ex.parentNode) ex.remove()
          }
        }

        return  // Hydration complete — effects handle future updates
      }
    }

    // --- Adopt any existing keyed elements not yet in scopes ---
    if (scopes.size === 0) {
      const loopRanges = startMarker
        ? findItemRanges(startMarker, endMarker!)
        : Array.from(container.children).map(
            (el) => ({ startMarker: null, primaryEl: el as HTMLElement, extras: [] as HTMLElement[] }),
          )
      for (const range of loopRanges) {
        const existingKey = range.primaryEl.dataset?.key
        if (existingKey && !scopes.has(existingKey)) {
          scopes.set(existingKey, {
            startMarker: range.startMarker,
            primaryEl: range.primaryEl,
            extras: range.extras,
            dispose: () => {},
            setItem: () => {},
          })
        }
      }
    }

    // --- Key-based diff ---
    const newKeys = new Set<string>()
    // Distinct from `newKeys`: tracks which keys have ALREADY emitted a
    // duplicate warning in this reconcile, so a 1000-item list where
    // every item shares one key emits ONE warning, not 999. (#1244 follow-up.)
    const warnedKeys = new Set<string>()
    const desiredOrder: ItemScope<T>[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey ? getKey(item, i) : String(i)
      if (newKeys.has(key) && !warnedKeys.has(key)) {
        warnedKeys.add(key)
        // The reconciler maps each unique key to a single scope, so a
        // second item with the same key overwrites the first scope's
        // data via `setItem` and effectively collapses every duplicate
        // into one rendered DOM node. The "list silently renders fewer
        // items than the array" failure mode used to be caught at
        // compile time before #1358 narrowed BF023.
        console.warn(
          `[BarefootJS] mapArray: duplicate key "${key}" — items with this key collapse to a single DOM scope, ` +
            `so only the last one renders. Use a per-item identifier (e.g. \`key={item.id}\`) for correct reconciliation.`,
        )
      }
      newKeys.add(key)

      const existing = scopes.get(key)
      if (existing) {
        // Same key: update per-item signal — fine-grained effects handle DOM updates.
        // Element is preserved (no dispose, no re-render).
        existing.setItem(item)
        desiredOrder.push(existing)
      } else {
        // New item: create in isolated scope
        const scope = createItemScope(item, i, renderItem)
        if (!scope.primaryEl.dataset.key) scope.primaryEl.setAttribute(BF_KEY, key)
        scopes.set(key, scope)
        desiredOrder.push(scope)
      }
    }

    // Remove items no longer in the array
    for (const [key, scope] of scopes) {
      if (!newKeys.has(key)) {
        scope.dispose()
        removeScope(scope)
        scopes.delete(key)
      }
    }

    // Reconcile DOM order: skip insertBefore entirely when order is unchanged.
    // Moving elements via insertBefore causes detach/reattach which makes
    // focused inputs lose focus (controlled input flicker). Each scope can
    // span multiple nodes (startMarker + primaryEl + extras), so the walk
    // consumes the full range when a primaryEl matches.
    let inOrder = true
    let checkNode: Node | null = startMarker ? startMarker.nextSibling : container.firstChild
    for (const scope of desiredOrder) {
      // Skip non-element nodes (comments, text) when looking for the primary element.
      while (checkNode && checkNode.nodeType !== Node.ELEMENT_NODE) checkNode = checkNode.nextSibling
      if (checkNode !== scope.primaryEl) { inOrder = false; break }
      // Advance past the rest of the scope's extras.
      checkNode = checkNode.nextSibling
      for (let i = 0; i < scope.extras.length; i++) {
        while (checkNode && checkNode.nodeType !== Node.ELEMENT_NODE) checkNode = checkNode.nextSibling
        if (checkNode !== scope.extras[i]) { inOrder = false; break }
        checkNode = checkNode.nextSibling
      }
      if (!inOrder) break
    }
    if (!inOrder) {
      for (const scope of desiredOrder) {
        insertScope(scope, container, anchor)
      }
    }
  })
}
