"use client"
/**
 * PivotTableDemo
 *
 * Dynamic row/column grouping with multi-level aggregation and expand/collapse.
 *
 * Compiler stress targets:
 * - 6-level memo chain: rowFields → groupedData → aggregatedCells → visibleRows → render
 * - Nested group loops: hierarchical rows with variable depth
 * - Cached aggregation with reactive update: aggregationFn change triggers only aggregatedCells+
 * - Dynamic loop structure: axis reconfiguration restructures entire table layout
 * - Multi-input memo convergence: aggregatedCells depends on 4 upstream signals/memos
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@ui/components/ui/select'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  XIcon,
  GripVerticalIcon,
} from '@ui/components/ui/icon'

// --- Types ---

type DimensionId = 'region' | 'product' | 'quarter' | 'salesperson'
type MeasureId = 'amount' | 'quantity'
type FieldId = DimensionId | MeasureId
type AggFn = 'sum' | 'avg' | 'count'
type AxisZone = 'available' | 'rows' | 'columns' | 'values'

type SalesRecord = {
  region: string
  product: string
  quarter: string
  salesperson: string
  amount: number
  quantity: number
}

type FieldDef = {
  id: FieldId
  label: string
  zone: 'dimension' | 'measure'
}

type GroupNode = {
  key: string
  field: string
  depth: number
  children: GroupNode[]
  records: SalesRecord[]
}

type PivotRow = {
  id: string
  label: string
  field: string
  depth: number
  isGroup: boolean
  records: SalesRecord[]
}

// --- Constants ---

const ALL_FIELDS: FieldDef[] = [
  { id: 'region', label: 'Region', zone: 'dimension' },
  { id: 'product', label: 'Product', zone: 'dimension' },
  { id: 'quarter', label: 'Quarter', zone: 'dimension' },
  { id: 'salesperson', label: 'Salesperson', zone: 'dimension' },
  { id: 'amount', label: 'Amount ($)', zone: 'measure' },
  { id: 'quantity', label: 'Quantity', zone: 'measure' },
]

const SAMPLE_DATA: SalesRecord[] = [
  { region: 'North', product: 'Widget', quarter: 'Q1', salesperson: 'Alice', amount: 12000, quantity: 120 },
  { region: 'North', product: 'Widget', quarter: 'Q2', salesperson: 'Alice', amount: 14500, quantity: 145 },
  { region: 'North', product: 'Gadget', quarter: 'Q1', salesperson: 'Bob', amount: 8200, quantity: 82 },
  { region: 'North', product: 'Gadget', quarter: 'Q3', salesperson: 'Bob', amount: 9100, quantity: 91 },
  { region: 'South', product: 'Widget', quarter: 'Q2', salesperson: 'Carol', amount: 11500, quantity: 115 },
  { region: 'South', product: 'Widget', quarter: 'Q4', salesperson: 'Carol', amount: 13200, quantity: 132 },
  { region: 'South', product: 'Gizmo', quarter: 'Q1', salesperson: 'Dave', amount: 6700, quantity: 67 },
  { region: 'South', product: 'Gizmo', quarter: 'Q3', salesperson: 'Dave', amount: 7400, quantity: 74 },
  { region: 'East', product: 'Widget', quarter: 'Q1', salesperson: 'Eve', amount: 15800, quantity: 158 },
  { region: 'East', product: 'Widget', quarter: 'Q3', salesperson: 'Eve', amount: 16200, quantity: 162 },
  { region: 'East', product: 'Gadget', quarter: 'Q2', salesperson: 'Frank', amount: 9800, quantity: 98 },
  { region: 'East', product: 'Gadget', quarter: 'Q4', salesperson: 'Frank', amount: 10500, quantity: 105 },
  { region: 'West', product: 'Gizmo', quarter: 'Q1', salesperson: 'Grace', amount: 5500, quantity: 55 },
  { region: 'West', product: 'Gizmo', quarter: 'Q2', salesperson: 'Grace', amount: 6200, quantity: 62 },
  { region: 'West', product: 'Widget', quarter: 'Q3', salesperson: 'Henry', amount: 17100, quantity: 171 },
  { region: 'West', product: 'Gadget', quarter: 'Q4', salesperson: 'Henry', amount: 11300, quantity: 113 },
]

// --- Helpers ---

function buildGroupTree(records: SalesRecord[], fields: DimensionId[], depth: number): GroupNode[] {
  if (fields.length === 0) return []
  const field = fields[0]
  const rest = fields.slice(1)
  const groups: Record<string, SalesRecord[]> = {}
  for (const r of records) {
    const val = r[field as keyof SalesRecord] as string
    if (!groups[val]) groups[val] = []
    groups[val].push(r)
  }
  const keys = Object.keys(groups).sort()
  const result: GroupNode[] = []
  for (const key of keys) {
    const recs = groups[key]
    result.push({
      key,
      field,
      depth,
      children: rest.length > 0 ? buildGroupTree(recs, rest as DimensionId[], depth + 1) : [],
      records: recs,
    })
  }
  return result
}

function flattenTree(
  nodes: GroupNode[],
  expandedGroups: Set<string>,
  parentId: string,
): PivotRow[] {
  const rows: PivotRow[] = []
  for (const node of nodes) {
    const id = parentId ? `${parentId}|${node.key}` : node.key
    rows.push({
      id,
      label: node.key,
      field: node.field,
      depth: node.depth,
      isGroup: node.children.length > 0,
      records: node.records,
    })
    if (node.children.length > 0 && expandedGroups.has(id)) {
      const childRows = flattenTree(node.children, expandedGroups, id)
      for (const r of childRows) {
        rows.push(r)
      }
    }
  }
  return rows
}

function aggregate(records: SalesRecord[], measure: MeasureId, fn: AggFn): number {
  if (records.length === 0) return 0
  if (fn === 'count') return records.length
  let sum = 0
  for (const r of records) {
    sum += r[measure]
  }
  if (fn === 'sum') return sum
  return Math.round((sum / records.length) * 100) / 100
}

function formatVal(n: number, fn: AggFn): string {
  if (fn === 'count') return String(n)
  return n.toLocaleString()
}

// --- Component ---

export function PivotTableDemo() {
  // --- Signals ---
  const [rowFields, setRowFields] = createSignal<DimensionId[]>(['region', 'product'])
  const [columnField, setColumnField] = createSignal<DimensionId | null>('quarter')
  const [valueField, setValueField] = createSignal<MeasureId>('amount')
  const [aggregationFn, setAggregationFn] = createSignal<AggFn>('sum')
  const [expandedGroups, setExpandedGroups] = createSignal<Set<string>>(new Set(['North', 'South', 'East', 'West']))

  // L1: available fields — not assigned to any axis
  const availableFields = createMemo(() => {
    const rows = rowFields()
    const col = columnField()
    const val = valueField()
    return ALL_FIELDS.filter(f => {
      if (f.zone === 'measure') return f.id !== val
      return rows.indexOf(f.id as DimensionId) === -1 && f.id !== col
    })
  })

  // L2: grouped data tree — hierarchy from rowFields
  const groupedData = createMemo(() => {
    const fields = rowFields()
    if (fields.length === 0) return []
    return buildGroupTree(SAMPLE_DATA, fields, 0)
  })

  // L3: unique column values — sorted values for the column split field
  const columnValues = createMemo(() => {
    const col = columnField()
    if (!col) return []
    const vals = new Set<string>()
    for (const r of SAMPLE_DATA) {
      vals.add(r[col as keyof SalesRecord] as string)
    }
    return Array.from(vals).sort()
  })

  // L4: aggregated cells — computes value for each (groupPath, columnValue) pair
  const aggregatedCells = createMemo(() => {
    const fn = aggregationFn()
    const measure = valueField()
    const colVals = columnValues()
    const col = columnField()
    const cells: Record<string, Record<string, number>> = {}

    function processNode(node: GroupNode, parentId: string) {
      const id = parentId ? `${parentId}|${node.key}` : node.key
      cells[id] = {}
      if (col && colVals.length > 0) {
        for (const cv of colVals) {
          const filtered = node.records.filter(r => r[col as keyof SalesRecord] === cv)
          cells[id][cv] = aggregate(filtered, measure, fn)
        }
      }
      cells[id]['__total__'] = aggregate(node.records, measure, fn)
      for (const child of node.children) {
        processNode(child, id)
      }
    }

    const nodes = groupedData()
    for (const node of nodes) {
      processNode(node, '')
    }

    // Also compute a root-level total when rowFields is empty
    if (nodes.length === 0) {
      cells['__root__'] = {}
      if (col && colVals.length > 0) {
        for (const cv of colVals) {
          const filtered = SAMPLE_DATA.filter(r => r[col as keyof SalesRecord] === cv)
          cells['__root__'][cv] = aggregate(filtered, measure, fn)
        }
      }
      cells['__root__']['__total__'] = aggregate(SAMPLE_DATA, measure, fn)
    }
    return cells
  })

  // L5: visible rows — flattened tree respecting expand/collapse
  const visibleRows = createMemo(() => {
    const nodes = groupedData()
    const expanded = expandedGroups()
    if (nodes.length === 0) {
      return [{
        id: '__root__',
        label: 'All Records',
        field: '',
        depth: 0,
        isGroup: false,
        records: SAMPLE_DATA,
      }]
    }
    return flattenTree(nodes, expanded, '')
  })

  // L6: grand totals — aggregate per column across all data
  const grandTotals = createMemo(() => {
    const fn = aggregationFn()
    const measure = valueField()
    const colVals = columnValues()
    const col = columnField()
    const totals: Record<string, number> = {}
    if (col && colVals.length > 0) {
      const colKey = col as keyof SalesRecord
      for (const cv of colVals) {
        const filtered = SAMPLE_DATA.filter(r => r[colKey] === cv)
        totals[cv] = aggregate(filtered, measure, fn)
      }
    }
    totals['__total__'] = aggregate(SAMPLE_DATA, measure, fn)
    return totals
  })

  // --- Actions ---

  const toggleExpand = (id: string) => {
    setExpandedGroups((prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const removeField = (fieldId: FieldId) => {
    const rows = rowFields()
    if (rows.indexOf(fieldId as DimensionId) !== -1) {
      setRowFields(rows.filter((f: DimensionId) => f !== fieldId))
      setExpandedGroups(new Set())
    } else if (fieldId === columnField()) {
      setColumnField(null)
    } else if (fieldId === valueField()) {
      setValueField('amount')
    }
  }

  const assignField = (fieldId: FieldId, zone: AxisZone) => {
    const field = ALL_FIELDS.find(f => f.id === fieldId)
    if (!field) return

    // Remove from current zone first
    removeField(fieldId)

    if (zone === 'rows' && field.zone === 'dimension') {
      setRowFields((prev: DimensionId[]) => {
        if (prev.indexOf(fieldId as DimensionId) !== -1) return prev
        if (prev.length >= 2) return prev
        return [...prev, fieldId as DimensionId]
      })
      setExpandedGroups(new Set())
    } else if (zone === 'columns' && field.zone === 'dimension') {
      setColumnField(fieldId as DimensionId)
    } else if (zone === 'values' && field.zone === 'measure') {
      setValueField(fieldId as MeasureId)
    }
  }

  // Drag handlers (curried: returns event handler for each field/zone)
  const handleDragStart = (fieldId: FieldId) => (e: DragEvent) => {
    e.dataTransfer!.setData('text/plain', fieldId)
    e.dataTransfer!.effectAllowed = 'move'
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
  }

  const handleDrop = (zone: AxisZone) => (e: DragEvent) => {
    e.preventDefault()
    const fieldId = e.dataTransfer!.getData('text/plain') as FieldId
    if (fieldId) {
      assignField(fieldId, zone)
    }
  }

  const groupCount = createMemo(() => visibleRows().length)

  // Helper memos for field labels (avoids IIFE in JSX which breaks CSR codegen)
  const columnLabel = createMemo(() => ALL_FIELDS.find(x => x.id === columnField())?.label ?? '')
  const valueLabel = createMemo(() => ALL_FIELDS.find(x => x.id === valueField())?.label ?? '')

  // Helper functions for row rendering (defined at component level to avoid
  // local variable scoping issues inside .map() callbacks — the compiler
  // may place locals in the wrong branch of the hydration if/else)
  const isGroupExpanded = (rowId: string) => expandedGroups().has(rowId)
  const getCellValue = (rowId: string, cv: string) => {
    const c = aggregatedCells()[rowId] || {}
    return c[cv] !== undefined && c[cv] !== 0 ? formatVal(c[cv], aggregationFn()) : '—'
  }
  const getRowTotal = (rowId: string) => {
    const c = aggregatedCells()[rowId] || {}
    return c['__total__'] !== undefined ? formatVal(c['__total__'], aggregationFn()) : '—'
  }

  // --- Render ---

  return (
    <div className="pivot-table-page w-full max-w-5xl mx-auto space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Pivot Table</h2>
        <div className="flex gap-2 items-center">
          <Badge variant="secondary" className="record-count">
            {SAMPLE_DATA.length} records
          </Badge>
          <Badge variant="outline" className="group-count">
            {groupCount()} rows
          </Badge>
        </div>
      </div>

      {/* Axis Configuration */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">

        {/* Available fields */}
        <div
          className="axis-zone axis-zone-available rounded-lg border-2 border-dashed border-muted-foreground/30 p-2 min-h-[72px]"
          onDragOver={handleDragOver}
          onDrop={handleDrop('available')}
        >
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Available</div>
          <div className="flex flex-wrap gap-1">
            {availableFields().map((f: FieldDef) => (
              <div
                key={f.id}
                className={`pivot-field pivot-field-${f.id} flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs cursor-grab select-none`}
                draggable={true}
                onDragStart={handleDragStart(f.id)}
              >
                <GripVerticalIcon className="w-3 h-3 text-muted-foreground" />
                {f.label}
              </div>
            ))}
          </div>
        </div>

        {/* Row fields */}
        <div
          className="axis-zone axis-zone-rows rounded-lg border-2 border-dashed border-blue-300 dark:border-blue-700 p-2 min-h-[72px]"
          onDragOver={handleDragOver}
          onDrop={handleDrop('rows')}
        >
          <div className="text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1.5">Rows</div>
          <div className="flex flex-wrap gap-1">
            {rowFields().map((fid: DimensionId) => {
              const f = ALL_FIELDS.find(x => x.id === fid)
              if (!f) return null
              return (
                <div
                  key={fid}
                  className={`pivot-field pivot-field-${fid} flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs cursor-grab select-none`}
                  draggable={true}
                  onDragStart={handleDragStart(fid)}
                >
                  <GripVerticalIcon className="w-3 h-3 opacity-60" />
                  {f.label}
                  <Button variant="ghost" size="icon-sm" className="field-remove-btn ml-0.5 opacity-60 hover:opacity-100" onClick={() => removeField(fid)} aria-label={`Remove ${f.label}`}>
                    <XIcon className="w-3 h-3" />
                  </Button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Column field */}
        <div
          className="axis-zone axis-zone-columns rounded-lg border-2 border-dashed border-purple-300 dark:border-purple-700 p-2 min-h-[72px]"
          onDragOver={handleDragOver}
          onDrop={handleDrop('columns')}
        >
          <div className="text-[10px] font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1.5">Columns</div>
          <div className="flex flex-wrap gap-1">
            {columnField() ? (
              <div
                className={`pivot-field pivot-field-${columnField()} flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs cursor-grab select-none`}
                draggable={true}
                onDragStart={handleDragStart(columnField() as FieldId)}
              >
                <GripVerticalIcon className="w-3 h-3 opacity-60" />
                {columnLabel()}
                <Button variant="ghost" size="icon-sm" className="field-remove-btn ml-0.5 opacity-60 hover:opacity-100" onClick={() => removeField(columnField() as FieldId)} aria-label={`Remove ${columnLabel()}`}>
                  <XIcon className="w-3 h-3" />
                </Button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Value field */}
        <div
          className="axis-zone axis-zone-values rounded-lg border-2 border-dashed border-green-300 dark:border-green-700 p-2 min-h-[72px]"
          onDragOver={handleDragOver}
          onDrop={handleDrop('values')}
        >
          <div className="text-[10px] font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-1.5">Values</div>
          <div className="flex flex-wrap gap-1">
            <div
              className={`pivot-field pivot-field-${valueField()} flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 text-xs cursor-grab select-none`}
              draggable={true}
              onDragStart={handleDragStart(valueField())}
            >
              <GripVerticalIcon className="w-3 h-3 opacity-60" />
              {valueLabel()}
            </div>
          </div>
        </div>
      </div>

      {/* Aggregation selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Aggregate by:</span>
        <div className="agg-select">
          <Select
            value={aggregationFn()}
            onValueChange={(v: string) => setAggregationFn(v as AggFn)}
          >
            <SelectTrigger className="w-[120px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="count">Count</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pivot Table */}
      <div className="rounded-lg border overflow-x-auto">
        <table className="pivot-table w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 pl-3 font-medium border-r min-w-[180px]">
                {rowFields().length > 0
                  ? rowFields().map((f: DimensionId) => ALL_FIELDS.find(x => x.id === f)?.label).join(' / ')
                  : 'Groups'}
              </th>
              {columnValues().map((cv: string) => (
                <th key={cv} className="pivot-header p-2 text-right font-medium border-r min-w-[90px]">
                  {cv}
                </th>
              ))}
              <th className="pivot-header p-2 text-right font-medium min-w-[90px]">Total</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows().map((item: PivotRow) => (
              <tr
                key={item.id}
                className={`pivot-row border-b last:border-0 hover:bg-accent/20 transition-colors${item.isGroup ? ' pivot-group-row' : ''}`}
              >
                <td className="p-2 border-r" style={`padding-left: ${12 + item.depth * 16}px`}>
                  <div className="flex items-center gap-1">
                    {item.isGroup ? (
                      <button
                        className="pivot-expand-btn text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => toggleExpand(item.id)}
                        aria-label={isGroupExpanded(item.id) ? 'Collapse' : 'Expand'}
                        aria-expanded={isGroupExpanded(item.id)}
                      >
                        {isGroupExpanded(item.id)
                          ? <ChevronDownIcon className="w-3.5 h-3.5" />
                          : <ChevronRightIcon className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className="w-3.5 h-3.5 inline-block" />
                    )}
                    <span className={item.isGroup ? 'font-medium' : 'text-muted-foreground'}>
                      {item.label}
                    </span>
                  </div>
                </td>
                {columnValues().map((cv: string) => (
                  <td key={cv} className="pivot-cell p-2 text-right tabular-nums border-r">
                    {getCellValue(item.id, cv)}
                  </td>
                ))}
                <td className="pivot-cell pivot-row-total p-2 text-right tabular-nums font-medium">
                  {getRowTotal(item.id)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="pivot-total-row bg-muted/30 border-t-2 font-semibold">
              <td className="p-2 pl-3 border-r">Grand Total</td>
              {columnValues().map((cv: string) => (
                <td key={cv} className="pivot-total-cell p-2 text-right tabular-nums border-r">
                  {formatVal(grandTotals()[cv] || 0, aggregationFn())}
                </td>
              ))}
              <td className="pivot-total-cell p-2 text-right tabular-nums">
                {formatVal(grandTotals()['__total__'] || 0, aggregationFn())}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer */}
      <div className="pivot-stats flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          Aggregation: <span className="font-medium text-foreground">{aggregationFn()}</span>
        </span>
        <span>·</span>
        <span>
          Value: <span className="font-medium text-foreground">{ALL_FIELDS.find(f => f.id === valueField())?.label}</span>
        </span>
      </div>
    </div>
  )
}
