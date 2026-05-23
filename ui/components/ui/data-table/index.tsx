"use client"

/**
 * Data Table Helper Components
 *
 * Reusable sub-components for building sortable, filterable, paginated tables.
 * Compose with the existing Table component for data display patterns.
 *
 * @example Sortable column header
 * ```tsx
 * <DataTableColumnHeader
 *   title="Amount"
 *   sorted="asc"
 *   onSort={() => handleSort('amount')}
 * />
 * ```
 *
 * @example Pagination
 * ```tsx
 * <DataTablePagination
 *   canPrev={page() > 0}
 *   canNext={page() < pageCount() - 1}
 *   onPrev={() => setPage(p => p - 1)}
 *   onNext={() => setPage(p => p + 1)}
 * >
 *   Page {page() + 1} of {pageCount()}
 * </DataTablePagination>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../../types'
import { ChevronUpIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ArrowUpDownIcon } from '../icon'

// Column header button classes
const columnHeaderClasses = 'inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer select-none'

// Pagination container classes
const paginationClasses = 'flex items-center justify-between px-2 py-4'

type SortDirection = 'asc' | 'desc' | false

interface DataTableColumnHeaderProps extends HTMLBaseAttributes {
  /** Column title */
  title: string
  /** Current sort direction */
  sorted?: SortDirection
  /** Callback when sort is toggled */
  onSort?: () => void
}

/**
 * Sortable column header button.
 * Shows sort direction icon (up/down/neutral).
 */
function DataTableColumnHeader({ title, sorted = false, onSort, className = '', ...props }: DataTableColumnHeaderProps) {
  return (
    <button
      data-slot="data-table-column-header"
      type="button"
      className={`${columnHeaderClasses} ${className}`}
      onClick={onSort}
      {...props}
    >
      {title}
      {sorted === 'asc' ? (
        <ChevronUpIcon size="sm" />
      ) : sorted === 'desc' ? (
        <ChevronDownIcon size="sm" />
      ) : (
        <ArrowUpDownIcon size="sm" />
      )}
    </button>
  )
}

interface DataTablePaginationProps extends HTMLBaseAttributes {
  /** Whether previous page is available */
  canPrev: boolean
  /** Whether next page is available */
  canNext: boolean
  /** Callback for previous page */
  onPrev: () => void
  /** Callback for next page */
  onNext: () => void
  /** Page info label (rendered as children) */
  children?: Child
}

// Pagination button classes (synced with button.tsx outline variant, sm size)
const paginationButtonClasses = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 h-8 px-3 has-[>svg]:px-2'

/**
 * Pagination controls for data tables.
 * Shows page info and prev/next buttons.
 *
 * Pass page label as children so reactive text nodes
 * are created in the parent's scope.
 */
function DataTablePagination({ canPrev, canNext, onPrev, onNext, children, className = '', ...props }: DataTablePaginationProps) {
  return (
    <div data-slot="data-table-pagination" className={`${paginationClasses} ${className}`} {...props}>
      <div className="text-sm text-muted-foreground">
        {children}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={paginationButtonClasses}
          onClick={onPrev}
          disabled={!canPrev}
        >
          <ChevronLeftIcon size="sm" />
          Previous
        </button>
        <button
          type="button"
          className={paginationButtonClasses}
          onClick={onNext}
          disabled={!canNext}
        >
          Next
          <ChevronRightIcon size="sm" />
        </button>
      </div>
    </div>
  )
}

export { DataTableColumnHeader, DataTablePagination }
export type { DataTableColumnHeaderProps, DataTablePaginationProps, SortDirection }
