"use client"
/**
 * SpreadsheetDemo
 *
 * Spreadsheet grid using nested mapArray (rows → cells).
 *
 * Compiler stress targets:
 * - Nested mapArray: rows().map(row => row.cells.map(cell => ...))
 * - Inner loop event handlers (cell click)
 * - Inner loop reactive text (cell value display)
 * - Cross-cell formula evaluation via memo chain
 * - Formula bar editing with conditional (Input vs span)
 * - Nested immutable updates for cell values
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Badge } from '@ui/components/ui/badge'

// --- Types ---

type CellValue = string | number
type Cell = { id: string; value: CellValue; formula: string | null }
type Row = { id: number; cells: Cell[] }

// --- Helpers ---

const COLS = ['A', 'B', 'C', 'D']

function cellId(col: string, row: number): string {
  return `${col}${row}`
}

function formatValue(v: CellValue): string {
  if (typeof v === 'number') return v.toLocaleString()
  return String(v)
}

function initialRows(): Row[] {
  const data: Record<string, { value: CellValue; formula: string | null }> = {
    A1: { value: 'Product', formula: null }, B1: { value: 'Price', formula: null },
    C1: { value: 'Qty', formula: null }, D1: { value: 'Total', formula: null },
    A2: { value: 'Widget', formula: null }, B2: { value: 29.99, formula: null },
    C2: { value: 10, formula: null }, D2: { value: 299.9, formula: '=B2*C2' },
    A3: { value: 'Gadget', formula: null }, B3: { value: 49.99, formula: null },
    C3: { value: 5, formula: null }, D3: { value: 249.95, formula: '=B3*C3' },
    A4: { value: 'Doohickey', formula: null }, B4: { value: 9.99, formula: null },
    C4: { value: 20, formula: null }, D4: { value: 199.8, formula: '=B4*C4' },
    A5: { value: 'Total', formula: null }, B5: { value: '', formula: null },
    C5: { value: '', formula: null }, D5: { value: 749.65, formula: '=SUM(D2:D4)' },
  }
  const result: Row[] = []
  for (let r = 1; r <= 5; r++) {
    const cells: Cell[] = COLS.map(col => {
      const id = cellId(col, r)
      const d = data[id] || { value: '', formula: null }
      return { id, value: d.value, formula: d.formula }
    })
    result.push({ id: r, cells })
  }
  return result
}

function evaluateFormulas(rows: Row[]): Record<string, CellValue> {
  const byId: Record<string, Cell> = {}
  for (const row of rows) for (const c of row.cells) byId[c.id] = c

  const result: Record<string, CellValue> = {}
  for (const row of rows) {
    for (const c of row.cells) {
      if (!c.formula) { result[c.id] = c.value; continue }
      const expr = c.formula.slice(1)
      const sumMatch = expr.match(/^SUM\(([A-D])(\d+):([A-D])(\d+)\)$/)
      if (sumMatch) {
        let sum = 0
        for (let r = parseInt(sumMatch[2], 10); r <= parseInt(sumMatch[4], 10); r++) {
          const v = byId[cellId(sumMatch[1], r)]?.value
          if (typeof v === 'number') sum += v
        }
        result[c.id] = Math.round(sum * 100) / 100
        continue
      }
      const mulMatch = expr.match(/^([A-D])(\d+)\*([A-D])(\d+)$/)
      if (mulMatch) {
        const a = byId[cellId(mulMatch[1], parseInt(mulMatch[2], 10))]?.value
        const b = byId[cellId(mulMatch[3], parseInt(mulMatch[4], 10))]?.value
        result[c.id] = typeof a === 'number' && typeof b === 'number' ? Math.round(a * b * 100) / 100 : 0
        continue
      }
      result[c.id] = c.formula
    }
  }
  return result
}

// --- Component ---

export function SpreadsheetDemo() {
  const [rows, setRows] = createSignal<Row[]>(initialRows())
  const [selectedCell, setSelectedCell] = createSignal<string | null>(null)
  const [editingCell, setEditingCell] = createSignal<string | null>(null)
  const [editValue, setEditValue] = createSignal('')

  const computed = createMemo(() => evaluateFormulas(rows()))

  const filledCount = createMemo(() => {
    const c = computed()
    return Object.values(c).filter(v => v !== '' && v !== null && v !== undefined).length
  })

  const numericSum = createMemo(() => {
    const c = computed()
    return Object.values(c).reduce((sum: number, v) => sum + (typeof v === 'number' ? v : 0), 0)
  })

  const selectCell = (id: string) => {
    if (editingCell() === id) return
    setSelectedCell(id)
    setEditingCell(null)
  }

  const startEditing = (id: string) => {
    for (const row of rows()) {
      const cell = row.cells.find(c => c.id === id)
      if (cell) {
        setEditingCell(id)
        setSelectedCell(id)
        setEditValue(cell.formula || String(cell.value ?? ''))
        return
      }
    }
  }

  const commitEdit = () => {
    const id = editingCell()
    if (!id) return
    const raw = editValue()
    let value: CellValue = raw
    let formula: string | null = null
    if (raw.startsWith('=')) {
      formula = raw
      value = 0
    } else {
      const num = parseFloat(raw)
      if (!isNaN(num) && String(num) === raw) value = num
    }
    setRows(prev => prev.map(row => ({
      ...row,
      cells: row.cells.map(c => c.id === id ? { ...c, value, formula } : c),
    })))
    setEditingCell(null)
  }

  const cancelEdit = () => setEditingCell(null)

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') cancelEdit()
  }

  const clearCell = () => {
    const id = selectedCell()
    if (!id) return
    setRows(prev => prev.map(row => ({
      ...row,
      cells: row.cells.map(c => c.id === id ? { ...c, value: '', formula: null } : c),
    })))
  }

  return (
    <div className="spreadsheet-page w-full max-w-3xl mx-auto space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Spreadsheet</h2>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="filled-count">{filledCount()} cells</Badge>
          <Button variant="outline" size="sm" className="clear-btn" onClick={clearCell} disabled={!selectedCell()}>
            Clear Cell
          </Button>
        </div>
      </div>

      {/* Formula bar — doubles as edit field */}
      <div className="formula-bar flex items-center gap-2 px-3 py-1.5 border rounded-lg bg-muted/30 text-sm">
        <span className="cell-ref font-mono font-medium w-8">{selectedCell() || ''}</span>
        <span className="text-muted-foreground">|</span>
        {editingCell() ? (
          <Input
            value={editValue()}
            onInput={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commitEdit}
            className="cell-input flex-1 h-7 font-mono text-sm"
            ref={(el) => requestAnimationFrame(() => el.focus())}
          />
        ) : (
          <span
            className="cell-formula flex-1 font-mono text-muted-foreground cursor-pointer"
            onClick={() => { if (selectedCell()) startEditing(selectedCell()!) }}
          >
            {selectedCell() ? formatValue(computed()[selectedCell()!] ?? '') : ''}
          </span>
        )}
      </div>

      {/* Grid — nested mapArray: rows → cells */}
      <div className="spreadsheet-grid border rounded-lg overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-10 p-2 border-r border-b text-center text-xs text-muted-foreground" />
              <th className="col-header p-2 border-r border-b text-center text-xs font-medium">A</th>
              <th className="col-header p-2 border-r border-b text-center text-xs font-medium">B</th>
              <th className="col-header p-2 border-r border-b text-center text-xs font-medium">C</th>
              <th className="col-header p-2 border-b text-center text-xs font-medium">D</th>
            </tr>
          </thead>
          <tbody>
            {rows().map(row => (
              <tr key={row.id} className="spreadsheet-row">
                <td className="row-header p-2 border-r border-b bg-muted/30 text-center text-xs text-muted-foreground font-medium">
                  {row.id}
                </td>
                {row.cells.map(cell => (
                  <td
                    key={cell.id}
                    className="spreadsheet-cell border-r border-b p-0 h-9 cursor-pointer hover:bg-accent/30"
                    onClick={() => selectCell(cell.id)}
                  >
                    <div className="cell-value px-2 py-1.5 truncate text-sm">
                      {formatValue(computed()[cell.id] ?? '')}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      <div className="stats-bar flex gap-4 text-xs text-muted-foreground">
        <span className="sum-display">Sum: {numericSum().toLocaleString()}</span>
      </div>
    </div>
  )
}
