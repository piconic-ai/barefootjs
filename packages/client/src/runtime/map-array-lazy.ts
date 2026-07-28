/**
 * BarefootJS - Lazy Row Graph List Rendering (slot unification §9, L2)
 *
 * `mapArrayLazy` renders a keyed reactive array WITHOUT any per-row reactive
 * resources: no `createRoot`, no per-item signal, no per-row effect, no
 * hydration-time query/claim/DOM-write per row. See
 * `spec/slot-unification.md` §9 for the design and the measurement spike
 * that motivated it (branch `claude/lazy-effect-spike`).
 *
 * A plain loop row has exactly two update paths, both already known without
 * per-row reactivity (§9.1):
 *
 *  1. **Item-driven changes** — the keyed reconciler detects them itself
 *     (`!Object.is(oldItem, newItem)` per key) and calls the row plan's
 *     `applyItem` directly. The row's DOM refs are claimed lazily on that
 *     row's FIRST item-driven write (a scan inside that one row, cached on
 *     `entry.refs`); a row that never updates never pays.
 *  2. **Outer-signal reads** — applied by ONE loop-level `createEffect`
 *     (`applyOuter`) iterating all entries with per-entry dedup, created
 *     only when the loop has such bindings.
 *
 * ## Row-plan contract (PINNED — L3's compiler emission targets exactly this)
 *
 * The compiler emits a {@link LazyRowPlan} per eligible loop
 * (§9.4 eligibility: plain single-root keyed rows whose data source is
 * hydration-consistent; everything else keeps the eager `mapArray`
 * emission). Obligations, split by side:
 *
 * **Runtime (this module) guarantees:**
 * - Hydration first run adopts SSR rows with ZERO per-row DOM mutations:
 *   `entry.key` is READ from the SSR-rendered `data-key` attribute (never
 *   written on adopted rows; `getKey(items[i], i)` is the fallback when the
 *   attribute is absent), `entry.item = items[i]` positionally (sound by
 *   the §9.3(2) compile-time eligibility gate), `refs`/`last` start `null`.
 * - `plan.createRow` / `plan.applyItem` are invoked inside the reconciler
 *   effect but wrapped in `untrack()`, so outer-signal reads during row
 *   creation or item application never subscribe the reconciler — it re-runs
 *   only when `accessor()`'s dependencies change. (`applyItem` is untracked
 *   for the same reason `createRow` is: mixed item+outer bindings read outer
 *   signals non-reactively there; the `applyOuter` effect owns the reactive
 *   side.)
 * - The runtime assigns `createRow`'s returned element to `entry.primaryEl`
 *   and stamps `data-key` on CSR-created rows if `createRow` didn't (same
 *   semantics as `mapArray`'s create path).
 * - When `plan.applyOuter` exists, ONE loop-level effect is created (after
 *   the reconciler effect, so its first run happens after adoption) whose
 *   body calls `applyOuter(entryList, seed)` with `seed === true` exactly
 *   once, on the very first run. `entryList` is a closure variable holding
 *   the entries in current order, REBUILT (reassigned) by the reconciler
 *   after every reconcile — chosen over a live/mutable view so a run of the
 *   effect can never observe a half-reconciled list, and read
 *   non-reactively so the effect re-runs ONLY on the outer signals
 *   `applyOuter` itself reads, never because the list was reconciled.
 * - **Re-subscribe seam** (`plan.outerNeedsResubscribe`): the previous
 *   bullet's "reconciles never re-run this effect" contract holds only when
 *   every outer read subscribes independently of the entries — true for a
 *   primed signal/memo getter, FALSE for a per-key subscription such as
 *   `createSelector`, whose selector subscribes the caller to the specific
 *   keys it was called with. For those, a reconcile can leave the effect
 *   subscribed to keys that no longer matter and NOT subscribed to keys that
 *   now do, so a loop that opts in re-runs `applyOuter` after any reconcile
 *   that created a row or changed an item (removals strand nothing). The
 *   opt-in is per loop: loops that do not set the flag keep the cheaper
 *   contract and pay nothing. See the seam's own comment inside
 *   `mapArrayLazy` for the three stranding sequences it exists to prevent,
 *   each of which was reproduced before it was written.
 *
 * **Plan (compiler-emitted) obligations:**
 * - `createRow` MUST write ALL bindings — item-driven AND outer-involving —
 *   with current values (it is CSR creation; it computes everything anyway)
 *   and MUST seed `entry.refs`/`entry.last` from known clone paths (no
 *   scan). Freshly-created rows are therefore consistent immediately; the
 *   `applyOuter` effect's per-entry dedup (seeded via `entry.last`) keeps
 *   them consistent on later outer-signal changes.
 * - `applyOuter`'s FIRST run (`seed === true`) must READ current DOM state
 *   (`getAttribute` / `nodeValue`) to initialize each entry's dedup value
 *   and write only where the computed value differs — read-compare-write
 *   seeding (§9.3(1)), sound even when outer state is client-only and
 *   diverges from SSR. No trust-first-run regression (§6).
 * - `applyItem` claims refs lazily (scan within `entry.primaryEl`) when
 *   `entry.refs` is null, and writes through per-binding dedup held on
 *   `entry.last` / `entry.refs`.
 *
 * ## Reconciliation
 *
 * The keyed diff, duplicate-key once-per-reconcile warning, clear-all fast
 * path, and LIS minimal-move reorder mirror `mapArray`'s exactly — minus
 * every per-row reactive resource. Removal is plain DOM detach: entries
 * hold no reactive resources (CSR rows created by `plan.createRow` hold
 * none either), so there is nothing to dispose.
 *
 * Single-root rows only (v1): the §9.4 eligibility gate guarantees the
 * compiler never targets this entry point for multi-root (Fragment) rows,
 * so there is no `startMarker`/`extras`/`bf-loop-i` bookkeeping here.
 *
 * Rows are NOT added to `hydratedScopes`: that mark exists for element
 * scopes the hydration walker must skip, and lazy-eligible rows are plain
 * markup (no nested component/host scopes — the eligibility gate excludes
 * them), so the mark would only spend per-row memory this design exists to
 * eliminate.
 *
 * Shared helpers: `findLoopMarkers` and `longestIncreasingSubsequenceIndices`
 * are imported from `./map-array.ts` (now exported for internal reuse)
 * rather than duplicated or extracted into a third module — they are pure,
 * behavior-identical for both reconcilers, and importing keeps exactly one
 * copy without churning `map-array.ts`'s structure. The loop-shaped logic
 * around them (partition, diff, clear fast path) is intentionally
 * re-written here rather than shared: it differs in what it carries per row
 * (plain entries vs reactive scopes) and forcing one parameterized body
 * would obscure both.
 *
 * `bfId` is forwarded to the reconciler effect only (same attribution point
 * as `mapArray`); profile mode never emits lazy loops (§9.4), so the outer
 * effect carries no id.
 */

import { createEffect, createSignal, untrack } from '@barefootjs/client/reactive'
import { BF_KEY } from '@barefootjs/shared'
import { findLoopMarkers, longestIncreasingSubsequenceIndices } from './map-array.ts'

/**
 * One row of a lazy loop: plain data, no reactive resources.
 * Built at adoption (hydration) or by the reconciler via `plan.createRow`.
 */
export interface LazyRowEntry<T> {
  key: string
  primaryEl: HTMLElement
  item: T
  /** plan-owned: claimed DOM refs, null until the row's first item-driven write */
  refs: unknown | null
  /** plan-owned: per-binding last-value dedup state */
  last: unknown | null
}

/**
 * The compiler-emitted row plan for a lazy-eligible loop.
 * See the module docstring for the pinned contract and each side's
 * obligations.
 */
export interface LazyRowPlan<T> {
  /** CSR create: clone/build a fully-written row element for item; record refs
   *  and dedup state directly on the entry (no scan). Returns the element. */
  createRow(entry: LazyRowEntry<T>, index: number): HTMLElement
  /** Item-driven (and mixed) bindings: called by the reconciler AFTER
   *  entry.item has been updated to the new item; prevItem is the old value.
   *  Claims refs lazily (scan within entry.primaryEl) when entry.refs is null.
   *  Writes through per-binding dedup held on entry.last / entry.refs. */
  applyItem(entry: LazyRowEntry<T>, prevItem: T): void
  /** Outer-involving bindings (present only when the loop has bindings that
   *  read signals from outside the row). Runtime wraps this in ONE
   *  createEffect for the whole loop. Reads its outer signals inside the
   *  callback (so the effect subscribes), then applies those bindings to
   *  every entry with per-entry dedup. `seed` is true on the effect's FIRST
   *  run only: the binding must READ current DOM state (getAttribute /
   *  nodeValue) to initialize its dedup value and write only where the
   *  computed value differs (read-compare-write, spec §9.3(1)). */
  applyOuter?(entries: ReadonlyArray<LazyRowEntry<T>>, seed: boolean): void
  /**
   * Set when `applyOuter`'s subscriptions can be STRANDED by a reconcile, so
   * the runtime must re-run it after one (see `mapArrayLazy`'s docstring,
   * "Re-subscribe seam"). Required whenever an outer read is not a plain
   * signal/memo getter the emitter primed — the per-key case
   * (`createSelector`) being the motivating one. Omitted (falsy) keeps the
   * cheaper contract: `applyOuter` re-runs ONLY on the outer signals it
   * reads, and a reconcile never triggers it.
   */
  outerNeedsResubscribe?: boolean
}

/**
 * Lazy-row-graph keyed list rendering (spec/slot-unification.md §9).
 *
 * @param accessor - Function returning the reactive array (signal/memo read)
 * @param container - DOM container element
 * @param getKey - Key extractor (null = use index). Receives plain item value.
 * @param plan - Compiler-emitted row plan (see {@link LazyRowPlan})
 * @param markerId - Scoped loop marker id (`<!--bf-loop:<id>-->`), see #1087
 * @param bfId - Profiler attribution id for the reconciler effect
 */
export function mapArrayLazy<T>(
  accessor: () => T[],
  container: HTMLElement | null,
  getKey: ((item: T, index: number) => string) | null,
  plan: LazyRowPlan<T>,
  markerId?: string,
  bfId?: string,
): void {
  if (!container) return

  const entries = new Map<string, LazyRowEntry<T>>()
  /**
   * Entries in current item order — the closure variable the reconciler
   * reassigns after every reconcile and the `applyOuter` effect reads
   * non-reactively (so reconciles never re-run that effect).
   */
  let entryList: LazyRowEntry<T>[] = []
  let hydrated = false

  /**
   * Re-subscribe seam. `applyOuter` subscribes to whatever its body reads,
   * and for a NON-primable outer read that set depends on the entries it
   * iterated — so a reconcile can strand it. Three sequences, all
   * reproduced against `createSelector` before this existed:
   *
   *  1. the entry list is EMPTY on the effect's first run, so the per-entry
   *     reads never execute, nothing is subscribed, and the loop is dead
   *     forever;
   *  2. a row is CREATED (under `untrack`, so its key is never registered)
   *     and then becomes the selected one — only that key flips, nobody
   *     listens, and the row stays stale. Note the list is never empty here,
   *     which is why an empty -> non-empty trigger is not enough;
   *  3. an ITEM changes the value a binding keys on (loop key derived from a
   *     different field), stranding the old key the same way.
   *
   * So the trigger is "the reconcile created a row or changed an item", not
   * "the list became non-empty". Removals strand nothing — the surviving
   * entries keep their subscriptions — so they do not bump.
   *
   * Only loops whose plan sets `outerNeedsResubscribe` pay for this: a
   * primed signal/memo read subscribes regardless of entry count and is not
   * per-key, so those loops keep the cheaper "outer signals only" contract.
   */
  const needsResubscribe = plan.outerNeedsResubscribe === true && plan.applyOuter !== undefined
  const [generation, bumpGeneration] = needsResubscribe ? createSignal(0) : [null, null]
  let stranded = false
  const markStranded = (): void => {
    if (needsResubscribe) stranded = true
  }
  const flushStranded = (): void => {
    if (stranded && bumpGeneration) {
      stranded = false
      bumpGeneration((n) => n + 1)
    }
  }

  // Loop boundary markers are structural — never removed or re-inserted by
  // this module — so cache them across effect runs, same as `mapArray`.
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

  /**
   * CSR row creation. `plan.createRow` runs inside the reconciler effect,
   * so it is wrapped in `untrack()`: it writes outer-involving bindings
   * with current values (contract), and those signal reads must not
   * subscribe the reconciler. The returned element is assigned to
   * `entry.primaryEl`; `data-key` is stamped if `createRow` didn't
   * (mirrors `mapArray`'s create path).
   */
  const createEntry = (item: T, index: number, key: string): LazyRowEntry<T> => {
    const entry: LazyRowEntry<T> = {
      key,
      // Assigned from createRow's return value below; createRow builds the
      // element and must not read primaryEl.
      primaryEl: undefined as unknown as HTMLElement,
      item,
      refs: null,
      last: null,
    }
    entry.primaryEl = untrack(() => plan.createRow(entry, index))
    if (!entry.primaryEl.dataset.key) entry.primaryEl.setAttribute(BF_KEY, key)
    markStranded()
    return entry
  }

  createEffect(() => {
    const items = accessor()
    if (!items) return

    const { start: startMarker, end: endMarker } = resolveMarkers()
    const anchor: Node | null = endMarker ?? null

    // --- First run: adopt SSR-rendered rows (zero per-row DOM mutations) ---
    if (!hydrated) {
      hydrated = true
      // Single-root rows: each ELEMENT_NODE child in the loop range is one row.
      const doms: HTMLElement[] = []
      for (
        let node: Node | null = startMarker ? startMarker.nextSibling : container.firstChild;
        node && node !== anchor;
        node = node.nextSibling
      ) {
        if (node.nodeType === Node.ELEMENT_NODE) doms.push(node as HTMLElement)
      }
      if (doms.length > 0 && entries.size === 0) {
        const list: LazyRowEntry<T>[] = []
        const shared = Math.min(doms.length, items.length)
        for (let i = 0; i < shared; i++) {
          const el = doms[i]
          // READ the SSR-rendered key (never write it on adopted rows);
          // positional item pairing is sound by the §9.3(2) eligibility gate.
          const ssrKey = el.getAttribute(BF_KEY)
          const key = ssrKey !== null ? ssrKey : getKey ? getKey(items[i], i) : String(i)
          const entry: LazyRowEntry<T> = { key, primaryEl: el, item: items[i], refs: null, last: null }
          entries.set(key, entry)
          list.push(entry)
        }
        // SSR rendered fewer rows than the current array — create the rest (CSR).
        for (let i = doms.length; i < items.length; i++) {
          const item = items[i]
          const key = getKey ? getKey(item, i) : String(i)
          const entry = createEntry(item, i, key)
          entries.set(key, entry)
          list.push(entry)
          container.insertBefore(entry.primaryEl, anchor)
        }
        // SSR rendered more rows than the current array — drop the orphans.
        for (let i = items.length; i < doms.length; i++) doms[i].remove()
        entryList = list
        flushStranded()
        return // Adoption complete — later accessor changes reconcile below.
      }
      // No SSR rows (CSR mount): fall through to the keyed path.
    }

    // --- Fast path: clearing the whole list ---
    // Mirrors `mapArray`: one ranged delete between markers, or a bulk
    // `textContent = ''` when the list owns the container's children
    // outright (verified by a node count so foreign siblings survive).
    if (items.length === 0) {
      if (entries.size > 0) {
        if (startMarker && endMarker) {
          const range = document.createRange()
          range.setStartAfter(startMarker)
          range.setEndBefore(endMarker)
          range.deleteContents()
        } else {
          let actualNodeCount = 0
          for (let node = container.firstChild; node; node = node.nextSibling) actualNodeCount++
          if (actualNodeCount === entries.size) {
            container.textContent = ''
          } else {
            for (const entry of entries.values()) entry.primaryEl.remove()
          }
        }
        entries.clear()
        entryList = []
      }
      // No flush: clearing strands nothing (there is nothing left to keep
      // subscribed), and `markStranded` is never set by a removal.
      return
    }

    // --- Key-based diff ---
    const newKeys = new Set<string>()
    // Distinct from `newKeys`: tracks which keys have ALREADY emitted a
    // duplicate warning in this reconcile, so a 1000-item list where every
    // item shares one key emits ONE warning, not 999 (same as `mapArray`).
    const warnedKeys = new Set<string>()
    const desiredOrder: LazyRowEntry<T>[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const key = getKey ? getKey(item, i) : String(i)
      if (newKeys.has(key) && !warnedKeys.has(key)) {
        warnedKeys.add(key)
        console.warn(
          `[BarefootJS] mapArrayLazy: duplicate key "${key}" — items with this key collapse to a single DOM row, ` +
            `so only the last one renders. Use a per-item identifier (e.g. \`key={item.id}\`) for correct reconciliation.`,
        )
      }
      newKeys.add(key)

      const existing = entries.get(key)
      if (existing) {
        // Same key: item-driven update is a DIRECT call — no signal, no
        // setItem. `applyItem` runs after `entry.item` is updated, receives
        // the previous item, and is untracked (mixed bindings may read
        // outer signals; the applyOuter effect owns the reactive side).
        if (!Object.is(existing.item, item)) {
          const prevItem = existing.item
          existing.item = item
          untrack(() => plan.applyItem(existing, prevItem))
          markStranded()
        }
        desiredOrder.push(existing)
      } else {
        const entry = createEntry(item, i, key)
        entries.set(key, entry)
        desiredOrder.push(entry)
      }
    }

    // Remove rows no longer in the array. Plain DOM detach — entries hold
    // no reactive resources (adopted and CSR-created alike), nothing to
    // dispose.
    for (const [key, entry] of entries) {
      if (!newKeys.has(key)) {
        if (entry.primaryEl.parentNode) entry.primaryEl.remove()
        entries.delete(key)
      }
    }

    // --- Reconcile DOM order: minimal-move, LIS-based (same as mapArray) ---
    // Rows kept stationary by the LIS are provably never detached; every
    // other row (moves + brand-new rows) is grouped into contiguous runs
    // inserted with ONE insertBefore per run.
    const primaryElToDesiredIndex = new Map<HTMLElement, number>()
    for (let i = 0; i < desiredOrder.length; i++) {
      primaryElToDesiredIndex.set(desiredOrder[i].primaryEl, i)
    }

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
      const before = j < desiredOrder.length ? desiredOrder[j].primaryEl : anchor
      if (j - i === 1) {
        container.insertBefore(desiredOrder[i].primaryEl, before)
      } else {
        const runFragment = document.createDocumentFragment()
        for (let k = i; k < j; k++) runFragment.appendChild(desiredOrder[k].primaryEl)
        container.insertBefore(runFragment, before)
      }
      i = j
    }

    entryList = desiredOrder
    // ONE bump per reconcile, after `entryList` is current so the re-run
    // iterates the new entries.
    flushStranded()
  }, bfId)

  // --- ONE loop-level effect for outer-involving bindings ---
  // Created AFTER the reconciler effect (createEffect runs its body
  // synchronously, so adoption has already happened when this first runs).
  // `seed` is true exactly once, on the very first run — set false before
  // calling so a throwing applyOuter can never seed twice. The effect reads
  // `entryList` from the closure (non-reactive), so it re-runs only when
  // the outer signals `applyOuter` reads inside its body change — never
  // because the list was reconciled.
  if (plan.applyOuter) {
    const applyOuter = plan.applyOuter.bind(plan)
    let seed = true
    createEffect(() => {
      // Subscribe to the seam so a stranding reconcile re-runs this effect
      // and its per-entry reads re-subscribe against the CURRENT entries.
      // Read unconditionally (not inside the `needsResubscribe` branch) is
      // impossible — `generation` only exists for loops that opted in — so
      // loops that did not opt in keep a subscription set built purely from
      // what `applyOuter` itself reads.
      if (generation) generation()
      const isSeed = seed
      seed = false
      applyOuter(entryList, isSeed)
    })
  }
}
