/**
 * Pivot Table Reference Page (/components/pivot-table)
 *
 * Block-level composition pattern: Dynamic row/column grouping with
 * multi-level aggregation, drag axis config, and expand/collapse groups.
 */

import { PivotTableDemo } from '@/components/pivot-table-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/client'

const SAMPLE_DATA = [
  { region: 'North', product: 'Widget', quarter: 'Q1', amount: 12000 },
  // ...16 records total
]

function PivotTable() {
  const [rowFields, setRowFields] = createSignal(['region', 'product'])
  const [columnField, setColumnField] = createSignal('quarter')
  const [aggregationFn, setAggregationFn] = createSignal('sum')
  const [expandedGroups, setExpandedGroups] = createSignal(new Set(['North', 'South', 'East', 'West']))

  // L2: group data by row fields
  const groupedData = createMemo(() =>
    buildGroupTree(SAMPLE_DATA, rowFields(), 0)
  )

  // L3: unique column split values
  const columnValues = createMemo(() => {
    const col = columnField()
    return [...new Set(SAMPLE_DATA.map(r => r[col]))].sort()
  })

  // L4: aggregate each (groupPath, columnValue) pair
  const aggregatedCells = createMemo(() => {
    const fn = aggregationFn()
    const col = columnField()
    const colVals = columnValues()
    // ... computes cells for all (row × column) intersections
    return computeCells(groupedData(), col, colVals, fn)
  })

  // L5: flatten tree respecting expand/collapse state
  const visibleRows = createMemo(() =>
    flattenTree(groupedData(), expandedGroups(), '')
  )

  // L6: grand totals per column
  const grandTotals = createMemo(() =>
    computeTotals(SAMPLE_DATA, columnField(), columnValues(), aggregationFn())
  )

  return (
    <table>
      <thead>
        <tr>
          <th>Groups</th>
          {columnValues().map(cv => <th key={cv}>{cv}</th>)}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows().map(row => (
          <tr key={row.id}>
            <td style={\`padding-left: \${12 + row.depth * 16}px\`}>
              {row.isGroup && (
                <button onClick={() => toggleExpand(row.id)}>▶</button>
              )}
              {row.label}
            </td>
            {columnValues().map(cv => (
              <td key={cv}>{aggregatedCells()[row.id]?.[cv] ?? '—'}</td>
            ))}
            <td>{aggregatedCells()[row.id]?.['__total__']}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Grand Total</td>
          {columnValues().map(cv => <td key={cv}>{grandTotals()[cv]}</td>)}
          <td>{grandTotals()['__total__']}</td>
        </tr>
      </tfoot>
    </table>
  )
}`

export function PivotTableRefPage() {
  return (
    <DocPage slug="pivot-table" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Pivot Table"
          description="Dynamic row/column grouping with multi-level aggregation, drag-and-drop axis configuration, and expand/collapse group rows."
          {...getNavLinks('pivot-table')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <PivotTableDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">6-Level Memo Dependency Chain</h3>
              <p className="text-sm text-muted-foreground">
                rowFields signal → groupedData memo → aggregatedCells memo (also depends on
                columnValues, valueField, aggregationFn) → visibleRows memo (also depends on
                expandedGroups) → render. Changing aggregationFn only recomputes aggregatedCells
                and downstream — groupedData is not re-evaluated, demonstrating memo caching.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Nested Group Loops</h3>
              <p className="text-sm text-muted-foreground">
                Row fields create a hierarchical tree (e.g., Region → Product). Expand/collapse
                state is tracked in a Set signal. The visibleRows memo flattens the tree
                respecting expansion state, producing a dynamic flat list for rendering. Each
                group row shows aggregated values computed from all descendant records.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Dynamic Loop Structure via Axis Reconfiguration</h3>
              <p className="text-sm text-muted-foreground">
                Drag fields between Available, Rows, Columns, and Values zones to restructure
                the table. Removing a row field collapses a grouping level; removing the column
                field eliminates the column split and shows a single Total column. These changes
                propagate through the entire 6-level memo chain, testing dynamic loop reconstruction.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Multi-Input Memo Convergence</h3>
              <p className="text-sm text-muted-foreground">
                aggregatedCells depends on groupedData (L2), columnValues (L3), valueField signal,
                and aggregationFn signal — four upstream sources converging on one memo. This tests
                that the compiler correctly batches multi-source updates without redundant recomputation.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">Drag-and-Drop Axis Configuration</h3>
              <p className="text-sm text-muted-foreground">
                Fields are draggable between axis zones using the HTML5 Drag and Drop API.
                Each zone enforces type constraints (dimensions only in Rows/Columns,
                measures only in Values). X buttons provide a non-drag fallback for removing
                fields from an axis.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
