"use client"

/**
 * Table Components
 *
 * A composable set of table sub-components for displaying structured data.
 * Inspired by shadcn/ui with CSS variable theming support.
 *
 * @example Basic table
 * ```tsx
 * <Table>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Name</TableHead>
 *       <TableHead>Status</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>Item 1</TableCell>
 *       <TableCell>Active</TableCell>
 *     </TableRow>
 *   </TableBody>
 * </Table>
 * ```
 *
 * @example Table with caption and footer
 * ```tsx
 * <Table>
 *   <TableCaption>A list of recent invoices.</TableCaption>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead>Invoice</TableHead>
 *       <TableHead className="text-right">Amount</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell>INV001</TableCell>
 *       <TableCell className="text-right">$250.00</TableCell>
 *     </TableRow>
 *   </TableBody>
 *   <TableFooter>
 *     <TableRow>
 *       <TableCell>Total</TableCell>
 *       <TableCell className="text-right">$250.00</TableCell>
 *     </TableRow>
 *   </TableFooter>
 * </Table>
 * ```
 */

import type { HTMLBaseAttributes } from '@barefootjs/jsx'
import type { Child } from '../../types'

// Table container classes (scrollable wrapper)
const tableContainerClasses = 'relative w-full overflow-x-auto'

// Table classes
const tableClasses = 'w-full caption-bottom border-collapse text-sm'

// TableHeader classes
const tableHeaderClasses = '[&_tr]:border-b'

// TableBody classes
const tableBodyClasses = '[&_tr:last-child]:border-0'

// TableFooter classes
const tableFooterClasses = 'bg-muted/50 border-t font-medium [&>tr]:last:border-b-0'

// TableRow classes
const tableRowClasses = 'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors'

// TableHead classes
const tableHeadClasses = 'text-foreground h-10 px-2 text-left align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'

// TableCell classes
const tableCellClasses = 'p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]'

// TableCaption classes
const tableCaptionClasses = 'text-muted-foreground mt-4 text-sm'

/**
 * Props for Table component.
 */
interface TableProps extends HTMLBaseAttributes {
  /** Table content (typically TableHeader, TableBody, TableFooter, TableCaption) */
  children?: Child
}

/**
 * Table container component with horizontal scroll support.
 *
 * @param props.children - Table sub-components
 * @param props.className - Additional CSS classes
 */
function Table({ children, className = '', ...props }: TableProps) {
  return (
    <div data-slot="table-container" className={tableContainerClasses}>
      <table data-slot="table" className={`${tableClasses} ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
}

/**
 * Props for TableHeader component.
 */
interface TableHeaderProps extends HTMLBaseAttributes {
  /** Header rows */
  children?: Child
}

/**
 * Table header section.
 *
 * @param props.children - TableRow elements
 */
function TableHeader({ children, className = '', ...props }: TableHeaderProps) {
  return (
    <thead data-slot="table-header" className={`${tableHeaderClasses} ${className}`} {...props}>
      {children}
    </thead>
  )
}

/**
 * Props for TableBody component.
 */
interface TableBodyProps extends HTMLBaseAttributes {
  /** Body rows */
  children?: Child
}

/**
 * Table body section.
 *
 * @param props.children - TableRow elements
 */
function TableBody({ children, className = '', ...props }: TableBodyProps) {
  return (
    <tbody data-slot="table-body" className={`${tableBodyClasses} ${className}`} {...props}>
      {children}
    </tbody>
  )
}

/**
 * Props for TableFooter component.
 */
interface TableFooterProps extends HTMLBaseAttributes {
  /** Footer rows */
  children?: Child
}

/**
 * Table footer section.
 *
 * @param props.children - TableRow elements
 */
function TableFooter({ children, className = '', ...props }: TableFooterProps) {
  return (
    <tfoot data-slot="table-footer" className={`${tableFooterClasses} ${className}`} {...props}>
      {children}
    </tfoot>
  )
}

/**
 * Props for TableRow component.
 */
interface TableRowProps extends HTMLBaseAttributes {
  /** Row cells */
  children?: Child
}

/**
 * Table row component.
 *
 * @param props.children - TableHead or TableCell elements
 */
function TableRow({ children, className = '', ...props }: TableRowProps) {
  return (
    <tr data-slot="table-row" className={`${tableRowClasses} ${className}`} {...props}>
      {children}
    </tr>
  )
}

/**
 * Props for TableHead component.
 */
interface TableHeadProps extends HTMLBaseAttributes {
  /** Header cell content */
  children?: Child
  /** Number of columns a header cell should span */
  colSpan?: number
  /** Number of rows a header cell should span */
  rowSpan?: number
  /** Specifies a group of columns for alignment */
  scope?: 'col' | 'colgroup' | 'row' | 'rowgroup'
}

/**
 * Table header cell component.
 *
 * @param props.children - Header content
 */
function TableHead({ children, className = '', ...props }: TableHeadProps) {
  return (
    <th data-slot="table-head" className={`${tableHeadClasses} ${className}`} {...props}>
      {children}
    </th>
  )
}

/**
 * Props for TableCell component.
 */
interface TableCellProps extends HTMLBaseAttributes {
  /** Cell content */
  children?: Child
  /** Number of columns a cell should span */
  colSpan?: number
  /** Number of rows a cell should span */
  rowSpan?: number
}

/**
 * Table data cell component.
 *
 * @param props.children - Cell content
 */
function TableCell({ children, className = '', ...props }: TableCellProps) {
  return (
    <td data-slot="table-cell" className={`${tableCellClasses} ${className}`} {...props}>
      {children}
    </td>
  )
}

/**
 * Props for TableCaption component.
 */
interface TableCaptionProps extends HTMLBaseAttributes {
  /** Caption text */
  children?: Child
}

/**
 * Table caption component.
 *
 * @param props.children - Caption content
 */
function TableCaption({ children, className = '', ...props }: TableCaptionProps) {
  return (
    <caption data-slot="table-caption" className={`${tableCaptionClasses} ${className}`} {...props}>
      {children}
    </caption>
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell, TableCaption }
export type { TableProps, TableHeaderProps, TableBodyProps, TableFooterProps, TableRowProps, TableHeadProps, TableCellProps, TableCaptionProps }
