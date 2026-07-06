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
import { hydratedScopes } from './hydration-state.ts'
import {
  BF_KEY,
  BF_LOOP_START,
  BF_LOOP_END,
  BF_LOOP_ITEM,
  loopStartMarker,
  loopEndMarker,
  loopItemMarker,
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
    // Walk via firstChild/nextSibling rather than Array.from(childNodes) —
    // this runs on every un-cached lookup (see `resolveMarkers` in
    // `mapArray`), so avoiding the intermediate array allocation matters
    // for large sibling counts.
    for (let node = container.firstChild; node; node = node.nextSibling) {
      if (node.nodeType !== Node.COMMENT_NODE) continue
      const value = (node as Comment).nodeValue
      if (value === startVal) start = node as Comment
      else if (value === endVal) end = node as Comment
    }
  } else {
    const startPrefix = `${BF_LOOP_START}:`
    const endPrefix = `${BF_LOOP_END}:`
    for (let node = container.firstChild; node; node = node.nextSibling) {
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
 * Insert a scope's nodes into `target` in their canonical order
 * (startMarker → primaryEl → extras). Idempotent — `insertBefore` on a
 * node already at the target position is a no-op.
 *
 * `target` is typed as `Node` (not `HTMLElement`) so callers can pass a
 * `DocumentFragment` to batch several scopes into one subsequent
 * `container.insertBefore(fragment, anchor)` call — see the minimal-move
 * reorder in `mapArray`.
 */
function insertScope<T>(scope: ItemScope<T>, target: Node, anchor: Node | null): void {
  if (scope.startMarker) target.insertBefore(scope.startMarker, anchor)
  target.insertBefore(scope.primaryEl, anchor)
  for (const ex of scope.extras) target.insertBefore(ex, anchor)
}

/**
 * Longest increasing subsequence, returned as ascending indices into `arr`.
 * O(n log n) patience sorting with predecessor backtracking.
 *
 * Used by `mapArray`'s reorder step: `arr` holds, for each already-attached
 * scope encountered while walking the live DOM in its current order, the
 * scope's index in the *desired* order. The LIS of that array is the
 * largest set of scopes whose relative order already matches the desired
 * order — those scopes can stay exactly where they are; every other scope
 * (plus any brand-new one) needs to move. This is the same strategy
 * keyed-diff reconcilers in the udomdiff/Solid family use to turn an
 * arbitrary reorder into a minimal set of DOM moves.
 */
function longestIncreasingSubsequenceIndices(arr: number[]): number[] {
  const n = arr.length
  if (n === 0) return []
  // tails[k] = index into `arr` of the smallest possible tail value for an
  // increasing subsequence of length k + 1.
  const tails: number[] = []
  const predecessors: number[] = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const value = arr[i]
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (arr[tails[mid]] < value) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) predecessors[i] = tails[lo - 1]
    if (lo === tails.length) tails.push(i)
    else tails[lo] = i
  }
  const result: number[] = new Array(tails.length)
  let k = tails[tails.length - 1]
  for (let i = tails.length - 1; i >= 0; i--) {
    result[i] = k
    k = predecessors[k]
  }
  return result
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
  bfId?: string,
): void {
  if (!container) return

  const scopes = new Map<string, ItemScope<T>>()
  let hydrated = false

  // Loop boundary markers are structural — this module never removes or
  // re-inserts them — so they can be found once and reused across every
  // effect run instead of rescanning `container.childNodes` on every
  // reconcile. `isConnected` guards against the (unusual) case of the
  // container itself being torn down and rebuilt out from under this
  // closure; in that case we fall back to a fresh lookup.
  let cachedStart: Comment | null = null
  let cachedEnd: Comment | null = null
  const resolveMarkers = (): { start: Comment | null; end: Comment | null } => {
    if (cachedStart && cachedEnd && cachedStart.isConnected && cachedEnd.isConnected) {
      return { start: cachedStart, end: cachedEnd }
    }
    const found = findLoopMarkers(container, markerId)
    cachedStart = found.start
    cachedEnd = found.end
    return found
  }

  createEffect(() => {
    const items = accessor()
    if (!items) return

    const { start: startMarker, end: endMarker } = resolveMarkers()
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

    // --- Fast path: clearing the whole list ---
    // When every existing scope is being removed, dispose them all and then
    // remove their DOM in one bulk operation instead of one `.remove()` per
    // scope. Loop markers (and their bracketing range) are always preserved.
    if (items.length === 0) {
      if (scopes.size > 0) {
        for (const scope of scopes.values()) scope.dispose()
        if (startMarker && endMarker) {
          // Scoped (or per-item-marker) range: the space between the
          // markers is owned entirely by this list, so a single Range
          // delete clears it without touching the markers themselves.
          const range = document.createRange()
          range.setStartAfter(startMarker)
          range.setEndBefore(endMarker)
          range.deleteContents()
        } else {
          // Unscoped: the list owns the container's children directly.
          // Verify no foreign siblings snuck in before nuking everything —
          // counting is O(n), same order as the disposal loop above, so it
          // doesn't add an asymptotically new cost.
          let expectedNodeCount = 0
          for (const scope of scopes.values()) {
            expectedNodeCount += 1 + scope.extras.length + (scope.startMarker ? 1 : 0)
          }
          let actualNodeCount = 0
          for (let node = container.firstChild; node; node = node.nextSibling) actualNodeCount++
          if (actualNodeCount === expectedNodeCount) {
            container.textContent = ''
          } else {
            for (const scope of scopes.values()) removeScope(scope)
          }
        }
        scopes.clear()
      }
      return
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

    // --- Reconcile DOM order: minimal-move, LIS-based ---
    //
    // Rather than "any mismatch reinserts every scope", find the longest
    // run of already-attached scopes that are already in the right
    // relative order — the longest increasing subsequence of their desired
    // positions, walking the live DOM once — and never touch those. Every
    // other scope (scopes that need to move, plus brand-new scopes not yet
    // in the DOM at all) is grouped into contiguous runs and inserted with
    // ONE insertBefore per run (a DocumentFragment when a run has more than
    // one scope). A swap of two rows becomes exactly two single-scope
    // moves; a bulk append becomes one fragment insert that never touches
    // the existing rows; an unchanged order performs zero DOM mutations.
    //
    // Moving elements via insertBefore causes detach/reattach which makes
    // focused inputs lose focus (controlled input flicker) — scopes kept
    // stationary by the LIS are provably never detached, so that guarantee
    // still holds for them.
    const primaryElToDesiredIndex = new Map<HTMLElement, number>()
    for (let i = 0; i < desiredOrder.length; i++) {
      primaryElToDesiredIndex.set(desiredOrder[i].primaryEl, i)
    }

    // Old DOM order of currently-attached scopes, expressed as desired-order
    // indices. Brand-new scopes aren't attached yet, so they simply never
    // appear here — which is exactly what marks them for insertion below.
    // Single O(n) walk, no Array.from allocation.
    const domOrderIndices: number[] = []
    for (
      let node: Node | null = startMarker ? startMarker.nextSibling : container.firstChild;
      node && node !== anchor;
      node = node.nextSibling
    ) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const idx = primaryElToDesiredIndex.get(node as HTMLElement)
      if (idx !== undefined) domOrderIndices.push(idx)
    }

    const stationary = new Array<boolean>(desiredOrder.length).fill(false)
    for (const pos of longestIncreasingSubsequenceIndices(domOrderIndices)) {
      stationary[domOrderIndices[pos]] = true
    }

    let i = 0
    while (i < desiredOrder.length) {
      if (stationary[i]) { i++; continue }
      let j = i
      while (j < desiredOrder.length && !stationary[j]) j++
      // Insert this run immediately before the next stationary scope (which
      // is already exactly where it needs to be), or before the loop's
      // trailing anchor when the run reaches the end of the list.
      const before = j < desiredOrder.length
        ? (desiredOrder[j].startMarker ?? desiredOrder[j].primaryEl)
        : anchor
      if (j - i === 1) {
        insertScope(desiredOrder[i], container, before)
      } else {
        const runFragment = document.createDocumentFragment()
        for (let k = i; k < j; k++) insertScope(desiredOrder[k], runFragment, null)
        container.insertBefore(runFragment, before)
      }
      i = j
    }
  }, bfId)
}

// ---------------------------------------------------------------------------
// Anchored list rendering (#1665) — whole-item loop conditionals.
//
// `arr.map(t => cond(t) && <li/>)` makes the conditional the entire loop
// item, so an item renders 0-or-1 element per pass. The legacy `mapArray`
// tracks each item by a required `primaryEl` Element, which cannot represent
// the empty (false-branch) item. `mapArrayAnchored` instead tracks each item
// by a `<!--bf-loop-i:KEY-->` anchor comment that is ALWAYS present. The
// item's content lives between its anchor and the next anchor / loop end and
// is derived from the live DOM range every pass (never cached): `insert()`
// owns the content, `mapArrayAnchored` owns the anchors (identity + order).
// ---------------------------------------------------------------------------

/** Item tracked by its always-present `bf-loop-i:KEY` anchor comment. */
type AnchorScope<T> = {
  anchor: Comment
  /** Detached nodes to mount for a freshly created (CSR) item; null once mounted. */
  pending: DocumentFragment | null
  dispose: () => void
  setItem: (v: T) => void
}

const ITEM_PREFIX = `${BF_LOOP_ITEM}:`

function isItemAnchor(node: Node): node is Comment {
  return (
    node.nodeType === Node.COMMENT_NODE &&
    ((node as Comment).nodeValue ?? '').startsWith(ITEM_PREFIX)
  )
}

/** Collect a live item range: the anchor and every node up to the next item
 *  anchor or the loop end marker (exclusive). Recomputed from the live DOM on
 *  every call rather than cached, because `insert()` adds and removes the
 *  item's content independently of this module — a cached node list would go
 *  stale the moment a conditional toggled. */
function collectAnchorRange(anchor: Comment, end: Comment | null): Node[] {
  const nodes: Node[] = [anchor]
  let node: Node | null = anchor.nextSibling
  while (node && node !== end) {
    if (isItemAnchor(node)) break
    nodes.push(node)
    node = node.nextSibling
  }
  return nodes
}

/** Partition the loop range into the item anchors present in SSR/CSR DOM. */
function findItemAnchors(start: Comment, end: Comment): Comment[] {
  const anchors: Comment[] = []
  let node: Node | null = start.nextSibling
  while (node && node !== end) {
    if (isItemAnchor(node)) anchors.push(node as Comment)
    node = node.nextSibling
  }
  return anchors
}

/** Move (or first-mount) a scope's whole range immediately before `before`. */
function placeAnchorScope<T>(
  scope: AnchorScope<T>,
  container: HTMLElement,
  before: Node | null,
  end: Comment | null,
): void {
  if (scope.pending) {
    container.insertBefore(scope.pending, before)
    scope.pending = null
    return
  }
  for (const node of collectAnchorRange(scope.anchor, end)) {
    container.insertBefore(node, before)
  }
}

/** Detach a scope's whole range from the DOM. */
function removeAnchorScope<T>(scope: AnchorScope<T>, end: Comment | null): void {
  for (const node of collectAnchorRange(scope.anchor, end)) {
    node.parentNode?.removeChild(node)
  }
}

function createAnchorScope<T>(
  item: T,
  index: number,
  key: string,
  renderItem: (item: () => T, index: number, existing?: Comment) => DocumentFragment | Comment,
  existingAnchor?: Comment,
): AnchorScope<T> {
  let dispose!: () => void
  let setItem!: (v: T) => void
  let returned!: DocumentFragment | Comment

  createRoot((d) => {
    dispose = d
    const [itemAccessor, itemSetter] = createSignal(item)
    setItem = itemSetter
    returned = renderItem(itemAccessor, index, existingAnchor)
    return undefined
  })

  if (existingAnchor) {
    return { anchor: existingAnchor, pending: null, dispose, setItem }
  }
  // CSR: renderItem returns a fragment whose first child is the anchor.
  const frag = returned as DocumentFragment
  const anchor = frag.firstChild as Comment
  // The renderItem already encodes the key into the anchor value, but tolerate
  // a bare anchor by stamping it here so identity/order reads stay consistent.
  if (anchor && !anchor.nodeValue?.startsWith(ITEM_PREFIX)) {
    anchor.nodeValue = loopItemMarker(key)
  }
  return { anchor, pending: frag, dispose, setItem }
}

/**
 * Per-item scoped list rendering for whole-item conditionals (#1665).
 *
 * Same call shape as `mapArray`, but `renderItem` returns a `DocumentFragment`
 * (CSR, first child = `bf-loop-i:KEY` anchor) or the existing anchor Comment
 * (hydration). Items may render zero elements; the anchor is the stable
 * identity and position.
 */
export function mapArrayAnchored<T>(
  accessor: () => T[],
  container: HTMLElement | null,
  getKey: ((item: T, index: number) => string) | null,
  renderItem: (item: () => T, index: number, existing?: Comment) => DocumentFragment | Comment,
  markerId?: string,
  bfId?: string,
): void {
  if (!container) return

  const scopes = new Map<string, AnchorScope<T>>()
  let hydrated = false

  createEffect(() => {
    const items = accessor()
    if (!items) return

    const { start, end } = findLoopMarkers(container, markerId)
    if (!start || !end) return

    // --- First run: adopt / hydrate SSR-rendered item anchors ---
    if (!hydrated) {
      hydrated = true
      const existing = findItemAnchors(start, end)
      if (existing.length > 0 && scopes.size === 0) {
        for (let i = 0; i < existing.length && i < items.length; i++) {
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          scopes.set(key, createAnchorScope(item, i, key, renderItem, existing[i]))
        }
        // SSR rendered fewer items than the current array — create the rest.
        for (let i = existing.length; i < items.length; i++) {
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          const scope = createAnchorScope(item, i, key, renderItem)
          scopes.set(key, scope)
          placeAnchorScope(scope, container, end, end)
        }
        // SSR rendered more items than the current array — drop the extras.
        for (let i = items.length; i < existing.length; i++) {
          for (const node of collectAnchorRange(existing[i], end)) {
            node.parentNode?.removeChild(node)
          }
        }
        return
      }
    }

    // --- Key-based diff ---
    const newKeys = new Set<string>()
    const warnedKeys = new Set<string>()
    const desiredOrder: AnchorScope<T>[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey ? getKey(item, i) : String(i)
      if (newKeys.has(key) && !warnedKeys.has(key)) {
        warnedKeys.add(key)
        console.warn(
          `[BarefootJS] mapArrayAnchored: duplicate key "${key}" — items with this key collapse to a ` +
            `single DOM scope, so only the last one renders. Use a per-item identifier (e.g. \`key={item.id}\`).`,
        )
      }
      newKeys.add(key)

      const existing = scopes.get(key)
      if (existing) {
        existing.setItem(item)
        desiredOrder.push(existing)
      } else {
        const scope = createAnchorScope(item, i, key, renderItem)
        scopes.set(key, scope)
        desiredOrder.push(scope)
      }
    }

    // Remove items no longer present.
    for (const [key, scope] of scopes) {
      if (!newKeys.has(key)) {
        scope.dispose()
        removeAnchorScope(scope, end)
        scopes.delete(key)
      }
    }

    // Reconcile DOM order. Comparing anchors (not elements) is correct even
    // for empty items, which contribute only their anchor to the range.
    let inOrder = true
    const domAnchors = findItemAnchors(start, end)
    if (domAnchors.length !== desiredOrder.length) {
      inOrder = false
    } else {
      for (let i = 0; i < desiredOrder.length; i++) {
        if (domAnchors[i] !== desiredOrder[i].anchor) { inOrder = false; break }
      }
    }
    if (!inOrder) {
      for (const scope of desiredOrder) {
        placeAnchorScope(scope, container, end, end)
      }
    }
  }, bfId)
}
