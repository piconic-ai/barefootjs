"use client"

/**
 * TriageList — a deliberately over-coupled cross-cutting UI.
 *
 * Purpose: an experiment in machine-verifiable consistency. The toolbar
 * (search / filter / sort), the selection, the header "select all" checkbox,
 * the bulk-action button, and the summary line are all derived from a single
 * source-of-truth set of signals. The number of coupled derived states
 * exceeds a single person's working memory on purpose.
 *
 * The consistency invariant under test:
 *   Selection is ALWAYS reckoned against the currently VISIBLE rows
 *   (selectedVisibleIds = selectedIds ∩ visibleIds).
 * Everything the user perceives about selection (count, header checkbox,
 * bulk-action enablement, summary) routes through selectedVisibleIds, so
 * changing the filter/search can never leave an "orphaned" selection that
 * silently acts on hidden rows.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'

interface TriageItem {
  id: string
  title: string
  status: 'open' | 'done'
  priority: number
}

interface TriageListProps {
  items: TriageItem[]
}

const PAGE_SIZE = 5

function TriageList(props: TriageListProps) {
  // ── source of truth (signals) ────────────────────────────────────────────
  const [query, setQuery] = createSignal('')
  const [filterStatus, setFilterStatus] = createSignal<'all' | 'open' | 'done'>('all')
  const [sortDir, setSortDir] = createSignal<'asc' | 'desc'>('asc')
  const [selectedIds, setSelectedIds] = createSignal<string[]>([])
  const [page, setPage] = createSignal(0)

  // ── derived state (memos) ─────────────────────────────────────────────────
  const normalizedQuery = createMemo(() => query().trim().toLowerCase())

  const statusFiltered = createMemo(() =>
    props.items.filter(it => filterStatus() === 'all' || it.status === filterStatus())
  )

  const searched = createMemo(() =>
    statusFiltered().filter(it => it.title.toLowerCase().includes(normalizedQuery()))
  )

  const sorted = createMemo(() =>
    [...searched()].sort((a, b) =>
      sortDir() === 'asc' ? a.priority - b.priority : b.priority - a.priority
    )
  )

  const totalPages = createMemo(() => Math.max(1, Math.ceil(sorted().length / PAGE_SIZE)))
  const clampedPage = createMemo(() => Math.min(page(), totalPages() - 1))
  const visible = createMemo(() =>
    sorted().slice(clampedPage() * PAGE_SIZE, clampedPage() * PAGE_SIZE + PAGE_SIZE)
  )
  const visibleIds = createMemo(() => visible().map(it => it.id))

  // the consistency-critical join: selection clamped to what is visible
  const selectedVisibleIds = createMemo(() =>
    selectedIds().filter(id => visibleIds().includes(id))
  )

  const selectedCount = createMemo(() => selectedVisibleIds().length)
  const allVisibleSelected = createMemo(() =>
    visible().length > 0 && selectedCount() === visible().length
  )
  const someSelected = createMemo(() => selectedCount() > 0)
  const headerState = createMemo(() =>
    allVisibleSelected() ? 'checked' : someSelected() ? 'indeterminate' : 'unchecked'
  )

  const bulkEnabled = createMemo(() => selectedCount() > 0)
  const bulkLabel = createMemo(() =>
    selectedCount() > 0 ? `Archive ${selectedCount()} selected` : 'Archive'
  )

  const openCount = createMemo(() => props.items.filter(it => it.status === 'open').length)
  const doneCount = createMemo(() => props.items.filter(it => it.status === 'done').length)

  const isEmpty = createMemo(() => visible().length === 0)
  const summary = createMemo(
    () => `Showing ${visible().length} of ${sorted().length} · ${selectedCount()} selected`
  )

  // ── selection mutation ────────────────────────────────────────────────────
  const toggleOne = (id: string) =>
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]))

  const toggleAllVisible = () =>
    setSelectedIds(ids =>
      allVisibleSelected()
        ? ids.filter(id => !visibleIds().includes(id))
        : Array.from(new Set([...ids, ...visibleIds()]))
    )

  // keep the rendered rows' visual state in sync with the derived selection
  const handleListMount = (el: HTMLElement) => {
    createEffect(() => {
      const vis = new Set(visibleIds())
      const sel = new Set(selectedVisibleIds())
      el.querySelectorAll('[data-slot="triage-row"]').forEach(node => {
        const row = node as HTMLElement
        const id = row.dataset.id ?? ''
        row.hidden = !vis.has(id)
        row.setAttribute('data-selected', sel.has(id) ? 'true' : 'false')
      })
    })

    el.addEventListener('click', (e: MouseEvent) => {
      const row = (e.target as HTMLElement).closest('[data-slot="triage-row"]') as HTMLElement | null
      if (row?.dataset.id) toggleOne(row.dataset.id)
    })
  }

  return (
    <div data-slot="triage-list" className="flex flex-col gap-3">
      <div data-slot="triage-toolbar" className="flex items-center gap-2">
        <input
          data-slot="triage-search"
          type="text"
          placeholder="Search…"
          value={query()}
          onInput={e => setQuery(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        />
        <button
          data-slot="filter-all"
          data-state={filterStatus() === 'all' ? 'active' : 'inactive'}
          onClick={() => setFilterStatus('all')}
          className="rounded border px-2 py-1 text-sm"
        >
          All
        </button>
        <button
          data-slot="filter-open"
          data-state={filterStatus() === 'open' ? 'active' : 'inactive'}
          onClick={() => setFilterStatus('open')}
          className="rounded border px-2 py-1 text-sm"
        >
          Open ({openCount()})
        </button>
        <button
          data-slot="filter-done"
          data-state={filterStatus() === 'done' ? 'active' : 'inactive'}
          onClick={() => setFilterStatus('done')}
          className="rounded border px-2 py-1 text-sm"
        >
          Done ({doneCount()})
        </button>
        <button
          data-slot="sort-toggle"
          onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
          className="rounded border px-2 py-1 text-sm"
        >
          Priority {sortDir() === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <div data-slot="triage-header" className="flex items-center gap-2 border-b pb-1">
        <button
          data-slot="select-all"
          role="checkbox"
          aria-checked={headerState() === 'checked'}
          data-state={headerState()}
          onClick={() => toggleAllVisible()}
          className="rounded border px-2 py-1 text-sm"
        >
          Select all
        </button>
        <button
          data-slot="bulk-archive"
          disabled={!bulkEnabled()}
          data-state={bulkEnabled() ? 'enabled' : 'disabled'}
          className="rounded border px-2 py-1 text-sm disabled:opacity-50"
        >
          {bulkLabel()}
        </button>
        <span data-slot="triage-summary" className="ml-auto text-sm text-muted-foreground">
          {summary()}
        </span>
      </div>

      <ul data-slot="triage-rows" ref={handleListMount} className="flex flex-col">
        {props.items.map(it => (
          <li
            key={it.id}
            data-slot="triage-row"
            data-id={it.id}
            data-selected="false"
            className="flex items-center gap-2 border-b px-2 py-1 text-sm data-[selected=true]:bg-accent"
          >
            <span data-slot="row-status" className="w-12 text-muted-foreground">{it.status}</span>
            <span data-slot="row-title">{it.title}</span>
            <span data-slot="row-priority" className="ml-auto text-muted-foreground">P{it.priority}</span>
          </li>
        ))}
      </ul>

      <div data-slot="triage-empty" hidden={!isEmpty()} className="py-6 text-center text-sm text-muted-foreground">
        Nothing matches the current filter.
      </div>
    </div>
  )
}

export { TriageList }
export type { TriageListProps, TriageItem }
